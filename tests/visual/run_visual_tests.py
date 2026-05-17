#!/usr/bin/env python3
"""Per-node visual testing: screenshot loop + DOM validation for NGS pipeline nodes."""

import argparse
import asyncio
import json
import re
import sys
from datetime import datetime
from pathlib import Path

import yaml
from playwright.async_api import async_playwright

FRONTEND = "http://localhost:5173"
SPECS_DIR = Path(__file__).parent / "specs"
SCREENSHOTS_DIR = Path(__file__).parent / "screenshots"


def load_specs(specs_dir: Path) -> list[dict]:
    specs = []
    for f in sorted(specs_dir.glob("*.yaml")):
        with open(f) as fh:
            specs.append(yaml.safe_load(fh))
    return specs


def parse_svg_arc(d: str) -> dict | None:
    """Parse an SVG arc path: M x1 y1 A rx ry rot large sweep x2 y2."""
    m = re.match(
        r"M\s+([\d.]+)\s+([\d.]+)\s+A\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)",
        d.strip(),
    )
    if not m:
        return None
    return {
        "x1": float(m.group(1)),
        "y1": float(m.group(2)),
        "rx": float(m.group(3)),
        "ry": float(m.group(4)),
        "large_arc": int(m.group(6)),
        "sweep": int(m.group(7)),
        "x2": float(m.group(8)),
        "y2": float(m.group(9)),
    }


async def validate_elements(node_el, elements: list[dict]) -> list[dict]:
    results = []
    for elem_spec in elements:
        sel = elem_spec["selector"]
        name = elem_spec.get("name", sel)
        required = elem_spec.get("required", True)
        min_count = elem_spec.get("min_count", 1)

        matches = await node_el.locator(sel).count()
        passed = matches >= min_count if required else True

        result = {"name": name, "selector": sel, "count": matches, "pass": passed}

        if matches > 0 and "attributes" in elem_spec:
            first = node_el.locator(sel).first
            for attr, expected in elem_spec["attributes"].items():
                actual = await first.get_attribute(attr)
                result[f"attr_{attr}"] = {"expected": expected, "actual": actual, "match": actual == expected}
                if actual != expected:
                    result["pass"] = False

        if matches > 0 and "text_matches" in elem_spec:
            text = await node_el.locator(sel).first.text_content()
            pattern = elem_spec["text_matches"]
            text_match = bool(re.search(pattern, text or ""))
            result["text"] = {"content": text, "pattern": pattern, "match": text_match}
            if not text_match:
                result["pass"] = False

        results.append(result)
    return results


async def check_arc_alignment(node_el) -> list[dict]:
    """Specific checks for ConfidenceGaugeNode arc overlay."""
    checks = []
    paths = node_el.locator("svg path")
    count = await paths.count()
    if count < 2:
        checks.append({"name": "arc_paths_exist", "pass": False, "detail": f"Found {count} paths, need 2"})
        return checks

    bg_d = await paths.nth(0).get_attribute("d")
    val_d = await paths.nth(1).get_attribute("d")
    bg = parse_svg_arc(bg_d) if bg_d else None
    val = parse_svg_arc(val_d) if val_d else None

    if not bg or not val:
        checks.append({"name": "arc_parse", "pass": False, "detail": f"bg={bg_d}, val={val_d}"})
        return checks

    # Both arcs share the same start point
    dx = abs(bg["x1"] - val["x1"])
    dy = abs(bg["y1"] - val["y1"])
    checks.append({
        "name": "shared_start_point",
        "pass": dx < 0.5 and dy < 0.5,
        "detail": f"bg_start=({bg['x1']},{bg['y1']}), val_start=({val['x1']},{val['y1']}), delta=({dx:.2f},{dy:.2f})",
    })

    # Same radius
    checks.append({
        "name": "same_radius",
        "pass": bg["rx"] == val["rx"] and bg["ry"] == val["ry"],
        "detail": f"bg_r=({bg['rx']},{bg['ry']}), val_r=({val['rx']},{val['ry']})",
    })

    # Value arc endpoint is on the same circle
    r = bg["rx"]
    cx, cy = 60, 52
    dist = ((val["x2"] - cx) ** 2 + (val["y2"] - cy) ** 2) ** 0.5
    checks.append({
        "name": "endpoint_on_circle",
        "pass": abs(dist - r) < 1.0,
        "detail": f"endpoint=({val['x2']:.1f},{val['y2']:.1f}), dist_from_center={dist:.2f}, expected_r={r}",
    })

    # Check viewBox clipping: arc visual extent with stroke
    stroke_half = 4
    arc_visual_top = cy - r - stroke_half
    arc_visual_bottom = cy + stroke_half
    svg_el = node_el.locator("svg").first
    svg_height = float(await svg_el.get_attribute("height") or 66)
    checks.append({
        "name": "no_viewbox_clip",
        "pass": arc_visual_top >= 0 and arc_visual_bottom <= svg_height,
        "detail": f"visual_top={arc_visual_top}, visual_bottom={arc_visual_bottom}, viewBox_height={svg_height}",
    })

    # Text centering
    text_el = node_el.locator("svg text")
    if await text_el.count() > 0:
        text_x = await text_el.first.get_attribute("x")
        text_anchor = await text_el.first.get_attribute("textAnchor") or await text_el.first.get_attribute("text-anchor")
        svg_width = 120
        text_centered = text_anchor == "middle" and abs(float(text_x or 0) - svg_width / 2) < 2
        checks.append({
            "name": "text_centered",
            "pass": text_centered,
            "detail": f"x={text_x}, textAnchor={text_anchor}, svg_center={svg_width / 2}",
        })

    return checks


async def check_bar_alignment(node_el) -> list[dict]:
    """Check that bar rows in FeatureBarsNode/ExplainWaterfallNode are consistently aligned."""
    checks = []
    rows = node_el.locator(".flex.items-center.gap-1")
    count = await rows.count()
    checks.append({"name": "row_count", "pass": count >= 5, "detail": f"found {count} rows"})

    if count > 0:
        lefts = []
        rights = []
        for i in range(min(count, 13)):
            box = await rows.nth(i).bounding_box()
            if box:
                lefts.append(box["x"])
                rights.append(box["x"] + box["width"])

        if lefts:
            left_spread = max(lefts) - min(lefts)
            right_spread = max(rights) - min(rights)
            checks.append({
                "name": "left_edge_aligned",
                "pass": left_spread < 3,
                "detail": f"spread={left_spread:.1f}px",
            })
            checks.append({
                "name": "right_edge_aligned",
                "pass": right_spread < 5,
                "detail": f"spread={right_spread:.1f}px",
            })

    return checks


async def check_table_alignment(node_el) -> list[dict]:
    """Check BridgeMonitorNode table column alignment."""
    checks = []
    rows = node_el.locator("tbody tr")
    count = await rows.count()
    checks.append({"name": "table_row_count", "pass": count >= 1, "detail": f"found {count} data rows"})

    header = node_el.locator("thead th")
    header_count = await header.count()
    checks.append({"name": "header_columns", "pass": header_count == 4, "detail": f"found {header_count} headers"})

    if count > 0:
        first_row_cells = node_el.locator("tbody tr:first-child td")
        cell_count = await first_row_cells.count()
        checks.append({
            "name": "cells_match_headers",
            "pass": cell_count == header_count,
            "detail": f"cells={cell_count}, headers={header_count}",
        })

    return checks


async def check_diagram_alignment(node_el) -> list[dict]:
    """Check PersistenceDiagramNode axis and point alignment."""
    checks = []
    lines = node_el.locator("svg line")
    line_count = await lines.count()
    checks.append({"name": "axis_lines", "pass": line_count >= 3, "detail": f"found {line_count} lines (need 2 axes + diagonal)"})

    circles = node_el.locator("svg circle")
    circle_count = await circles.count()
    checks.append({"name": "data_points", "pass": circle_count >= 1, "detail": f"found {circle_count} points"})

    if line_count >= 2:
        ax1_x1 = float(await lines.nth(0).get_attribute("x1") or 0)
        ax1_y1 = float(await lines.nth(0).get_attribute("y1") or 0)
        ax2_x1 = float(await lines.nth(1).get_attribute("x1") or 0)
        ax2_y1 = float(await lines.nth(1).get_attribute("y1") or 0)
        dx = abs(ax1_x1 - ax2_x1)
        dy = abs(ax1_y1 - ax2_y1)
        checks.append({
            "name": "axes_share_origin",
            "pass": dx < 2 and dy < 2,
            "detail": f"ax1_start=({ax1_x1},{ax1_y1}), ax2_start=({ax2_x1},{ax2_y1})",
        })

    legend = node_el.locator("svg g circle")
    legend_count = await legend.count()
    checks.append({"name": "legend_circles", "pass": legend_count >= 3, "detail": f"found {legend_count} legend items"})

    return checks


async def check_heatmap_alignment(node_el) -> list[dict]:
    """Check DriftMatrixNode heatmap grid regularity."""
    checks = []
    rects = node_el.locator("svg rect")
    rect_count = await rects.count()
    checks.append({"name": "heatmap_cells", "pass": rect_count >= 1, "detail": f"found {rect_count} cells"})

    if rect_count >= 2:
        xs = set()
        ys = set()
        for i in range(min(rect_count, 50)):
            x = float(await rects.nth(i).get_attribute("x") or 0)
            y = float(await rects.nth(i).get_attribute("y") or 0)
            xs.add(round(x, 1))
            ys.add(round(y, 1))

        checks.append({
            "name": "grid_columns",
            "pass": len(xs) >= 1,
            "detail": f"found {len(xs)} unique x positions",
        })
        checks.append({
            "name": "grid_rows",
            "pass": len(ys) >= 5,
            "detail": f"found {len(ys)} unique y positions",
        })

    return checks


ALIGNMENT_DISPATCH = {
    "confidence_gauge": check_arc_alignment,
    "feature_bars": check_bar_alignment,
    "explain_waterfall": check_bar_alignment,
    "bridge_monitor": check_table_alignment,
    "persistence_diagram": check_diagram_alignment,
    "drift_matrix": check_heatmap_alignment,
}

DETAIL_PANEL_SELECTOR = ".absolute.right-0.top-0.bottom-0.w-\\[420px\\]"
DETAIL_TAB_MAP = {"overview": "Overview", "timeseries": "Series", "config": "Config", "drift": "Drift"}

CANVAS_TYPE_MAP: dict[str, str] = {
    "prompt_input": "Pipeline",
    "feature_bars": "Pipeline",
    "hidden_state_cloud": "Pipeline",
    "persistence_diagram": "Pipeline",
    "confidence_gauge": "Pipeline",
    "bridge_monitor": "Pipeline",
    "explain_waterfall": "Pipeline",
    "drift_matrix": "Pipeline",
    "lf_stage": "Pipeline",
    "lf_pipeline_group": "Pipeline",
    "lf_coordinator": "Research",
    "lf_stats": "Research",
    "lf_autorel": "Research",
    "research_coordinator": "Research",
    "research_bridge": "Research",
    "r2_bridge": "Research v2",
    "r2_coordinator": "Research v2",
    "r2_stats": "Research v2",
    "r2_autorel": "Research v2",
    "r2_state": "Research v2",
}


async def capture_detail_panel(page, node_el, node_type: str, detail_spec: dict, panel_dir: Path) -> list[dict]:
    """Click node to open detail panel, screenshot each tab, then close."""
    results = []
    tabs = detail_spec.get("tabs", ["overview", "timeseries", "config", "drift"])

    # Click the node to select it and open detail panel
    box = await node_el.bounding_box()
    if not box:
        results.append({"name": "detail_panel_open", "pass": False, "detail": "No bounding box"})
        return results

    # First, click canvas pane to clear any existing selection
    pane = page.locator(".react-flow__pane")
    if await pane.count() > 0:
        pane_box = await pane.first.bounding_box()
        if pane_box:
            await page.mouse.click(pane_box["x"] + 20, pane_box["y"] + 20)
            await asyncio.sleep(0.3)

    # Re-fetch bounding box since layout may have shifted
    box = await node_el.bounding_box()
    if not box:
        results.append({"name": "detail_panel_open", "pass": False, "detail": "No bounding box after pane click"})
        return results

    # Click on the node border area (not center) to avoid scroll containers swallowing the click
    cx = box["x"] + 10
    cy = box["y"] + 10
    await page.mouse.click(cx, cy)
    await asyncio.sleep(0.8)

    # Verify panel opened
    panel = page.locator(DETAIL_PANEL_SELECTOR)
    panel_visible = await panel.count() > 0
    if not panel_visible:
        # Try broader selector
        panel = page.locator("[class*='w-[420px]']")
        panel_visible = await panel.count() > 0

    if not panel_visible:
        # Try clicking the node element directly with force
        await node_el.click(force=True, position={"x": 5, "y": 5})
        await asyncio.sleep(0.8)
        panel = page.locator(DETAIL_PANEL_SELECTOR)
        panel_visible = await panel.count() > 0
        if not panel_visible:
            panel = page.locator("[class*='w-[420px]']")
            panel_visible = await panel.count() > 0

    if not panel_visible:
        is_optional = detail_spec.get("optional", False)
        results.append({
            "name": "detail_panel_open",
            "pass": is_optional,
            "detail": "Panel did not appear after click" + (" (optional)" if is_optional else ""),
        })
        # Press Escape to clean up
        await page.keyboard.press("Escape")
        await asyncio.sleep(0.3)
        return results

    results.append({"name": "detail_panel_open", "pass": True, "detail": "Panel opened successfully"})

    # Screenshot each tab
    for tab_key in tabs:
        tab_label = DETAIL_TAB_MAP.get(tab_key, tab_key.capitalize())
        tab_btn = panel.locator(f"button:text-is('{tab_label}')")

        if await tab_btn.count() == 0:
            results.append({"name": f"tab_{tab_key}", "pass": False, "detail": f"Tab button '{tab_label}' not found"})
            continue

        await tab_btn.click()
        await asyncio.sleep(0.5)

        # Screenshot the panel
        panel_box = await panel.first.bounding_box()
        if panel_box:
            await page.screenshot(
                path=str(panel_dir / f"detail-{tab_key}.png"),
                clip={
                    "x": max(0, panel_box["x"]),
                    "y": max(0, panel_box["y"]),
                    "width": panel_box["width"],
                    "height": panel_box["height"],
                },
            )
            results.append({"name": f"tab_{tab_key}", "pass": True, "detail": f"Captured {tab_key} tab"})
        else:
            results.append({"name": f"tab_{tab_key}", "pass": False, "detail": "Panel box not found after tab click"})

    # Close panel: Escape to deselect, then click canvas background to ensure clean state
    await page.keyboard.press("Escape")
    await asyncio.sleep(0.3)
    pane = page.locator(".react-flow__pane")
    if await pane.count() > 0:
        pane_box = await pane.first.bounding_box()
        if pane_box:
            await page.mouse.click(pane_box["x"] + 20, pane_box["y"] + 20)
            await asyncio.sleep(0.3)

    return results


async def run_tests(
    specs_dir: Path,
    output_dir: Path,
    duration: int,
    interval: int,
    wait_ticks: int,
    headless: bool,
):
    specs = load_specs(specs_dir)
    if not specs:
        print("No specs found in", specs_dir)
        return

    ts = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
    run_dir = output_dir / f"run-{ts}"
    run_dir.mkdir(parents=True, exist_ok=True)

    console_errors: list[str] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        ctx = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=2,
        )
        page = await ctx.new_page()
        page.on("console", lambda msg: console_errors.append(f"[{msg.type}] {msg.text}") if msg.type in ("error", "warning") else None)

        print(f"Navigating to {FRONTEND}...")
        await page.goto(FRONTEND)
        await page.wait_for_selector(".react-flow__node", timeout=15000)

        # Close event log panel if open (it overlaps nodes at the bottom)
        log_btn = page.locator("button", has_text="Log")
        if await log_btn.count() > 0:
            # Check if event log is visible
            event_log = page.locator(".shrink-0.border-t")
            if await event_log.count() > 0:
                await log_btn.first.click()
                await asyncio.sleep(0.5)
                print("Closed event log panel for cleaner screenshots")

        # Hide minimap so it doesn't intercept clicks or overlap nodes
        await page.evaluate("""
            const mm = document.querySelector('[data-testid="rf__minimap"]');
            if (mm) mm.style.display = 'none';
        """)

        # Fit view to see all nodes
        fit_btn = page.locator(".react-flow__controls button").first
        if await fit_btn.count() > 0:
            await fit_btn.click(force=True)
            await asyncio.sleep(1)

        print(f"Waiting {wait_ticks * 2}s for data to flow...")
        await asyncio.sleep(wait_ticks * 2)

        # Full canvas baseline
        await page.screenshot(path=str(run_dir / "00-full-canvas.png"))

        # Group specs by canvas type and sort so we minimize tab switches
        canvas_order = ["Pipeline", "Research", "Research v2"]
        specs_by_canvas: dict[str, list[dict]] = {}
        for spec in specs:
            ct = CANVAS_TYPE_MAP.get(spec["node_type"], "Pipeline")
            specs_by_canvas.setdefault(ct, []).append(spec)

        ordered_specs: list[dict] = []
        for ct in canvas_order:
            ordered_specs.extend(specs_by_canvas.get(ct, []))

        current_canvas: str | None = None

        results = []
        for spec in ordered_specs:
            node_type = spec["node_type"]
            selector = spec["selector"]
            target_canvas = CANVAS_TYPE_MAP.get(node_type, "Pipeline")
            node_dir = run_dir / node_type
            node_dir.mkdir(parents=True, exist_ok=True)

            # Switch canvas tab if needed
            if target_canvas != current_canvas:
                tab_btn = page.locator(f".border-b.border-neutral-800 button:text-is('{target_canvas}')")
                if await tab_btn.count() > 0:
                    await tab_btn.first.click()
                    await asyncio.sleep(1.5)
                    # Wait for nodes to render on the new canvas
                    try:
                        await page.wait_for_selector(".react-flow__node", timeout=5000)
                    except Exception:
                        pass
                    # Fit view
                    fit_btn = page.locator(".react-flow__controls button").first
                    if await fit_btn.count() > 0:
                        await fit_btn.click(force=True)
                        await asyncio.sleep(0.5)
                    current_canvas = target_canvas
                    print(f"\n=== Switched to canvas: {target_canvas} ===")
                    await page.screenshot(path=str(run_dir / f"00-canvas-{target_canvas.lower().replace(' ', '-')}.png"))
                else:
                    print(f"\n=== Canvas tab '{target_canvas}' not found — skipping nodes on this canvas ===")
                    # Mark all specs for this canvas as NOT_FOUND
                    remaining_for_canvas = [s for s in ordered_specs if CANVAS_TYPE_MAP.get(s["node_type"]) == target_canvas]
                    for s in remaining_for_canvas:
                        results.append({"node": s["node_type"], "status": "NOT_FOUND"})
                    current_canvas = target_canvas
                    continue

            print(f"\n--- {spec['display_name']} ({node_type}) ---")

            node_el = page.locator(selector).first
            if await node_el.count() == 0:
                print(f"  NOT FOUND: {selector}")
                results.append({"node": node_type, "status": "NOT_FOUND"})
                continue

            # Validate elements
            elem_results = await validate_elements(node_el, spec.get("elements", []))
            for er in elem_results:
                status = "PASS" if er["pass"] else "FAIL"
                print(f"  [{status}] {er['name']}: count={er['count']}")

            # Run alignment checks
            alignment_fn = ALIGNMENT_DISPATCH.get(node_type)
            alignment_results = []
            if alignment_fn:
                alignment_results = await alignment_fn(node_el)
                for ar in alignment_results:
                    status = "PASS" if ar["pass"] else "FAIL"
                    print(f"  [{status}] {ar['name']}: {ar['detail']}")

            # Screenshot loop
            cap = spec.get("capture", {})
            node_duration = min(duration, cap.get("duration_seconds", duration))
            node_interval = cap.get("interval_seconds", interval)
            shots = max(1, node_duration // node_interval)

            print(f"  Capturing {shots} screenshots over {node_duration}s...")
            for tick in range(shots):
                box = await node_el.bounding_box()
                if box:
                    pad = cap.get("padding", 40)
                    clip = {
                        "x": max(0, box["x"] - pad),
                        "y": max(0, box["y"] - pad),
                        "width": box["width"] + 2 * pad,
                        "height": box["height"] + 2 * pad,
                    }
                    await page.screenshot(
                        path=str(node_dir / f"tick-{tick + 1:03d}.png"),
                        clip=clip,
                    )
                if tick < shots - 1:
                    await asyncio.sleep(node_interval)

            # Detail panel screenshots (if spec has detail_panel section)
            detail_spec = spec.get("detail_panel")
            detail_results = []
            if detail_spec:
                print(f"  Capturing detail panel tabs: {detail_spec.get('tabs', [])}")
                detail_results = await capture_detail_panel(page, node_el, node_type, detail_spec, node_dir)
                for dr in detail_results:
                    status = "PASS" if dr["pass"] else "FAIL"
                    print(f"  [{status}] {dr['name']}: {dr['detail']}")

            results.append({
                "node": node_type,
                "status": "OK",
                "shots": shots,
                "elements": elem_results,
                "alignment": alignment_results,
                "detail_panel": detail_results,
                "all_pass": (
                    all(e["pass"] for e in elem_results)
                    and all(a["pass"] for a in alignment_results)
                    and all(d["pass"] for d in detail_results)
                ),
            })

        await browser.close()

    # Write report
    report = {
        "timestamp": ts,
        "duration": duration,
        "interval": interval,
        "results": results,
        "console_errors": console_errors[:50],
    }
    report_path = run_dir / "_report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    # Summary
    summary_lines = [f"Visual Test Run: {ts}", f"Duration: {duration}s, Interval: {interval}s", ""]
    total_pass = 0
    total_fail = 0
    for r in results:
        if r["status"] == "NOT_FOUND":
            summary_lines.append(f"  {r['node']}: NOT FOUND")
            total_fail += 1
            continue
        node_pass = r.get("all_pass", False)
        icon = "PASS" if node_pass else "FAIL"
        summary_lines.append(f"  [{icon}] {r['node']} ({r['shots']} shots)")
        for e in r.get("elements", []):
            if not e["pass"]:
                summary_lines.append(f"    FAIL element: {e['name']} (count={e['count']})")
        for a in r.get("alignment", []):
            if not a["pass"]:
                summary_lines.append(f"    FAIL alignment: {a['name']} - {a['detail']}")
        for d in r.get("detail_panel", []):
            if not d["pass"]:
                summary_lines.append(f"    FAIL detail: {d['name']} - {d['detail']}")
        if node_pass:
            total_pass += 1
        else:
            total_fail += 1

    summary_lines.extend(["", f"Total: {total_pass} pass, {total_fail} fail"])

    if console_errors:
        summary_lines.extend(["", f"Console errors ({len(console_errors)}):", *[f"  {e}" for e in console_errors[:10]]])

    summary_text = "\n".join(summary_lines)
    with open(run_dir / "_summary.txt", "w") as f:
        f.write(summary_text)

    print(f"\n{'=' * 60}")
    print(summary_text)
    print(f"\nScreenshots: {run_dir}")
    print(f"Report: {report_path}")


def main():
    parser = argparse.ArgumentParser(description="NGS per-node visual tests")
    parser.add_argument("--specs-dir", type=Path, default=SPECS_DIR)
    parser.add_argument("--output-dir", type=Path, default=SCREENSHOTS_DIR)
    parser.add_argument("--duration", type=int, default=60, help="Total capture duration per node (seconds)")
    parser.add_argument("--interval", type=int, default=5, help="Seconds between screenshots")
    parser.add_argument("--wait-ticks", type=int, default=5, help="Daemon ticks to wait (x 2s each)")
    parser.add_argument("--no-headless", action="store_true", help="Run with visible browser")
    args = parser.parse_args()

    asyncio.run(run_tests(
        specs_dir=args.specs_dir,
        output_dir=args.output_dir,
        duration=args.duration,
        interval=args.interval,
        wait_ticks=args.wait_ticks,
        headless=not args.no_headless,
    ))


if __name__ == "__main__":
    main()
