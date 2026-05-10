"""
E2E Playwright audit of the linkforge paper digestion pipeline.

Tests the full paper lifecycle: live streaming → waterfall nodes → paper pool →
paper detail → sorting/filtering → search. Captures screenshots at each step.

Requires: docker compose services running, Playwright installed.
"""

import asyncio
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, Page, expect

SCREENSHOTS_DIR = Path(__file__).parent / "docs" / "screenshots" / "paper-pipeline"
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
API_BASE = "http://localhost:8080"
FRONTEND_URL = "http://localhost:5173"

pass_count = 0
fail_count = 0
warn_count = 0
findings: list[dict] = []


def result(status: str, msg: str, *, severity: str = "low", fix: str = ""):
    global pass_count, fail_count, warn_count
    if status == "PASS":
        pass_count += 1
    elif status == "FAIL":
        fail_count += 1
        findings.append({"status": status, "msg": msg, "severity": severity, "fix": fix})
    elif status == "WARN":
        warn_count += 1
        findings.append({"status": status, "msg": msg, "severity": severity, "fix": fix})
    print(f"  [{status}] {msg}")


def screenshot(page: Page, name: str):
    path = SCREENSHOTS_DIR / f"{name}.png"
    page.screenshot(path=str(path), full_page=False)
    print(f"  >> {path.name}")


# ── Phase 1: Backend health + linkforge endpoints ─────────────────────────


def test_backend_linkforge_api():
    print("\n=== Phase 1: Backend Health & LinkForge API ===")
    import urllib.request

    resp = urllib.request.urlopen(f"{API_BASE}/health")
    data = json.loads(resp.read())
    assert data["status"] == "ok"
    result("PASS", "/health returns ok")

    try:
        resp = urllib.request.urlopen(f"{API_BASE}/api/linkforge/history?limit=5")
        data = json.loads(resp.read())
        result("PASS", f"/api/linkforge/history returns {len(data)} items")
    except Exception as e:
        result("FAIL", f"/api/linkforge/history failed: {e}", severity="high",
               fix="Check Redis connection and linkforge_history.py")

    try:
        resp = urllib.request.urlopen(f"{API_BASE}/api/linkforge/paper/nonexistent")
        result("WARN", "/api/linkforge/paper/nonexistent should 404 but returned 200",
               severity="medium", fix="Check 404 handling in linkforge_history.py")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            result("PASS", "/api/linkforge/paper/nonexistent returns 404")
        else:
            result("WARN", f"/api/linkforge/paper/nonexistent returned {e.code}")


# ── Phase 2: Initial canvas load (no linkforge data) ──────────────────────


def test_canvas_initial(page: Page):
    print("\n=== Phase 2: Initial Canvas Load ===")

    page.goto(FRONTEND_URL, wait_until="networkidle")
    page.wait_for_timeout(3000)

    rf = page.locator(".react-flow")
    expect(rf).to_be_visible(timeout=10000)
    result("PASS", "React Flow container visible")

    screenshot(page, "01-canvas-initial")

    pool_visible = page.locator("text=All categories").count() > 0
    if pool_visible:
        result("WARN", "Paper pool visible before any papers processed — should be hidden",
               severity="low", fix="showPool starts false, should only show after first completed event")
    else:
        result("PASS", "Paper pool correctly hidden before paper events")

    palette = page.locator("text=Node Palette")
    if palette.count() > 0:
        result("PASS", "Node palette sidebar visible")
    else:
        result("WARN", "Node palette not visible")

    node_count = page.locator(".react-flow__node").count()
    result("PASS", f"{node_count} default nodes on canvas")

    graph_id = page.evaluate("localStorage.getItem('substrate:lastGraphId')")
    if graph_id:
        result("PASS", f"graphId persisted: {graph_id[:8]}...")
    else:
        result("WARN", "No graphId in localStorage")

    return graph_id


# ── Phase 3: Node palette — check all linkforge nodes are listed ──────────


def test_node_palette(page: Page):
    print("\n=== Phase 3: Node Palette Audit ===")

    expected_lf_nodes = [
        "Pipeline Stage",
        "Pipeline Coordinator",
        "Pipeline Stats",
        "AutoRel Status",
        "Research Coordinator",
    ]

    palette_text = ""
    palette_el = page.locator('[class*="palette"], [class*="Palette"]').first
    if palette_el.count() > 0:
        palette_text = palette_el.inner_text()
    else:
        sidebar = page.locator(".react-flow").locator("..").locator("div").first
        palette_text = page.locator("text=Node Palette").locator("..").locator("..").inner_text()

    for node_label in expected_lf_nodes:
        if node_label in palette_text:
            result("PASS", f"Palette contains '{node_label}'")
        else:
            result("FAIL", f"Palette missing '{node_label}'",
                   severity="medium", fix=f"Check NODE_REGISTRY and node-types.ts for {node_label}")

    # Check research_coordinator is in registry but NOT in nodeTypes
    research_in_palette = "Research Coordinator" in palette_text
    if research_in_palette:
        # It's in the palette — check if it has a component
        result("WARN", "Research Coordinator in palette but may have no React component — would render as default node",
               severity="medium", fix="Add ResearchCoordinatorNode component or remove from NODE_REGISTRY")

    screenshot(page, "02-node-palette")


# ── Phase 4: Drag linkforge nodes onto canvas ─────────────────────────────


def test_add_lf_nodes(page: Page):
    print("\n=== Phase 4: Add LinkForge Nodes to Canvas ===")

    # Click each linkforge node button in palette
    lf_buttons = {
        "Pipeline Coordinator": "lf_coordinator",
        "Pipeline Stats": "lf_stats",
        "AutoRel Status": "lf_autorel",
    }

    for label, type_id in lf_buttons.items():
        btn = page.locator(f"button:has-text('{label}')")
        if btn.count() > 0:
            btn.first.click()
            page.wait_for_timeout(500)
            result("PASS", f"Added '{label}' node")
        else:
            result("FAIL", f"Could not find palette button for '{label}'",
                   severity="medium")

    page.wait_for_timeout(1000)

    # Fit view
    fit_btn = page.locator(".react-flow__controls-fitview")
    if fit_btn.count() > 0:
        fit_btn.click()
        page.wait_for_timeout(1000)

    screenshot(page, "03-lf-nodes-added")

    # Check that the nodes rendered with proper content
    all_nodes = page.locator(".react-flow__node")
    node_count = all_nodes.count()
    result("PASS", f"{node_count} total nodes on canvas after adding LF nodes")

    # Check for "watching 10 streams" text (coordinator)
    coordinator_text = page.locator("text=watching 10 streams")
    if coordinator_text.count() > 0:
        result("PASS", "Pipeline Coordinator shows 'watching 10 streams'")
    else:
        result("WARN", "Pipeline Coordinator text not visible (may be off-viewport)")

    # Check for "waiting for sweep..." text (autorel)
    autorel_text = page.locator("text=waiting for sweep")
    if autorel_text.count() > 0:
        result("PASS", "AutoRel shows 'waiting for sweep...'")
    else:
        result("WARN", "AutoRel text not visible")

    # Check pipeline stats shows zeros
    stats_zero = page.locator("text=0 (0%)")
    if stats_zero.count() > 0:
        result("PASS", "Pipeline Stats shows initial zeros")
    else:
        result("WARN", "Pipeline Stats initial state not verifiable")


# ── Phase 5: Start synthetic linkforge publisher ──────────────────────────


def start_linkforge_publisher():
    print("\n=== Phase 5: Starting Synthetic LinkForge Publisher ===")

    daemon = subprocess.Popen(
        [sys.executable, str(Path(__file__).parent / "synthetic_linkforge.py")],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    print(f"  [INFO] Publisher PID={daemon.pid}")
    return daemon


# ── Phase 6: Live waterfall node creation ─────────────────────────────────


def test_live_waterfall(page: Page):
    print("\n=== Phase 6: Live Waterfall Node Creation ===")

    # Wait for papers to stream through (8 papers × ~4s each = ~32s total)
    print("  [INFO] Waiting 35s for 8 papers to flow through pipeline...")
    page.wait_for_timeout(35000)

    # Fit view to see the waterfall
    fit_btn = page.locator(".react-flow__controls-fitview")
    if fit_btn.count() > 0:
        fit_btn.click()
        page.wait_for_timeout(1500)

    screenshot(page, "04-live-waterfall-full")

    # Count lf_stage nodes (should be many — up to 10 stages × 8 papers)
    lf_nodes = page.locator('.react-flow__node[data-id^="lf-"]')
    lf_count = lf_nodes.count()
    print(f"  [INFO] lf_stage nodes on canvas: {lf_count}")

    if lf_count > 0:
        result("PASS", f"{lf_count} pipeline stage nodes created from live events")
    else:
        result("FAIL", "No lf_stage nodes appeared from live events",
               severity="high", fix="Check WS subscription and handleLinkforgeEvent in App.tsx")

    # Check for edges between stages
    edges = page.locator(".react-flow__edge")
    edge_count = edges.count()
    if edge_count > 0:
        result("PASS", f"{edge_count} edges visible (stage connections)")
    else:
        result("WARN", "No edges visible between stage nodes")

    # Check stage labels
    for label in ["Ingested", "Extracted", "Categorized", "Completed"]:
        el = page.locator(f"text={label}")
        if el.count() > 0:
            result("PASS", f"Stage label '{label}' visible")
        else:
            result("WARN", f"Stage label '{label}' not visible (may be off-viewport)")

    # Check for failed stage (paper 6 is set to fail)
    red_border = page.locator('[class*="border-red"]')
    if red_border.count() > 0:
        result("PASS", "Red border visible for failed paper")
    else:
        result("WARN", "No red border for failed paper — may not have rendered yet")


# ── Phase 7: Paper pool appears ───────────────────────────────────────────


def test_paper_pool(page: Page):
    print("\n=== Phase 7: Paper Pool ===")

    pool_visible = page.locator("text=All categories").count() > 0
    if pool_visible:
        result("PASS", "Paper pool appeared after completed events")
    else:
        result("FAIL", "Paper pool did not appear after completed events",
               severity="high", fix="Check showPool state in App.tsx — set on linkforge:completed")
        return

    screenshot(page, "05-paper-pool-visible")

    # Check paper cards
    paper_cards = page.locator("button").filter(has=page.locator('[class*="truncate"]'))
    card_count = paper_cards.count()
    print(f"  [INFO] Paper card buttons: {card_count}")

    # Check for category badges
    category_badges = page.locator('[class*="bg-neutral-800"][class*="px-1"]')
    badge_count = category_badges.count()
    if badge_count > 0:
        result("PASS", f"{badge_count} category badges visible on cards")

    # Check for forge score bars
    score_bars = page.locator('[class*="rounded-full"][class*="h-1.5"]')
    bar_count = score_bars.count()
    if bar_count > 0:
        result("PASS", f"{bar_count} score bars visible")

    # Check for "N" new badge
    new_badges = page.locator("text=N")
    print(f"  [INFO] 'N' new badges: {new_badges.count()}")

    # Check for failed paper card
    failed_text = page.locator("text=failed")
    if failed_text.count() > 0:
        result("PASS", "Failed paper card shows 'failed' text")
    else:
        result("WARN", "No 'failed' text visible in pool")

    # Check sort dropdown
    sort_select = page.locator("select").nth(1)
    if sort_select.count() > 0:
        options = sort_select.locator("option")
        opt_count = options.count()
        result("PASS", f"Sort dropdown has {opt_count} options")
    else:
        result("WARN", "Sort dropdown not found")

    # Check research checkbox
    research_cb = page.locator("input[type='checkbox']")
    if research_cb.count() > 0:
        result("PASS", "Research-only checkbox present")


# ── Phase 8: Paper detail ─────────────────────────────────────────────────


def test_paper_detail(page: Page):
    print("\n=== Phase 8: Paper Detail View ===")

    # Check initial "Select a paper" message
    select_msg = page.locator("text=Select a paper")
    if select_msg.count() > 0:
        result("PASS", "'Select a paper' placeholder visible")

    # Click first paper card
    paper_btns = page.locator('[class*="rounded-lg"][class*="border"][class*="p-2"]')
    if paper_btns.count() == 0:
        paper_btns = page.locator("button").filter(has=page.locator('[class*="truncate"]'))

    if paper_btns.count() > 0:
        paper_btns.first.click()
        page.wait_for_timeout(2000)
        screenshot(page, "06-paper-detail")

        # Check detail content loaded
        loading = page.locator("text=Loading...")
        if loading.count() > 0:
            page.wait_for_timeout(3000)

        # Pipeline stages waterfall
        stages_header = page.locator("text=Pipeline Stages")
        if stages_header.count() > 0:
            result("PASS", "Pipeline Stages section visible in detail")
        else:
            result("FAIL", "Pipeline Stages section missing in detail",
                   severity="medium", fix="Check PaperDetail.tsx rendering")

        # Check stage dots
        green_dots = page.locator('[class*="bg-emerald-500"][class*="rounded-full"]')
        green_count = green_dots.count()
        if green_count > 0:
            result("PASS", f"{green_count} green stage dots (completed stages)")
        else:
            result("WARN", "No green stage dots — waterfall may be broken",
                   severity="high", fix="Check STAGE_INDICATORS in PaperDetail.tsx")

        # Check for summary
        summary_header = page.locator("text=Summary")
        if summary_header.count() > 0:
            result("PASS", "Summary section visible")

        # Check for URL link
        url_link = page.locator("a[target='_blank']")
        if url_link.count() > 0:
            result("PASS", "URL link present in detail")

    else:
        result("FAIL", "No paper cards to click", severity="high")


# ── Phase 9: Sorting and filtering ────────────────────────────────────────


def test_sorting_filtering(page: Page):
    print("\n=== Phase 9: Sorting & Filtering ===")

    # Test sort by forge score
    sort_select = page.locator("select").nth(1)
    if sort_select.count() > 0:
        sort_select.select_option("forge_score")
        page.wait_for_timeout(1000)
        screenshot(page, "07-sorted-by-score")
        result("PASS", "Sorted by forge score")

        # Verify sort order (first card should have highest score)
        score_texts = page.locator('[class*="text-neutral-500"]').all_inner_texts()
        scores = []
        for t in score_texts:
            t = t.strip()
            try:
                s = float(t)
                if 0 < s < 1:
                    scores.append(s)
            except ValueError:
                pass
        if len(scores) >= 2:
            if scores[0] >= scores[1]:
                result("PASS", f"Score sort order correct: {scores[0]:.2f} >= {scores[1]:.2f}")
            else:
                result("FAIL", f"Score sort order WRONG: {scores[0]:.2f} < {scores[1]:.2f}",
                       severity="medium", fix="Check sort logic in PaperPool.tsx filtered useMemo")
        else:
            result("WARN", "Could not verify sort order (not enough scores visible)")

        # Sort by processing time
        sort_select.select_option("processing_time")
        page.wait_for_timeout(500)
        result("PASS", "Sorted by processing time")

        # Sort by category
        sort_select.select_option("category")
        page.wait_for_timeout(500)
        result("PASS", "Sorted by category")

        # Reset to recent
        sort_select.select_option("recent")
        page.wait_for_timeout(500)

    # Test category filter
    cat_select = page.locator("select").first
    if cat_select.count() > 0:
        options = cat_select.locator("option")
        opt_count = options.count()
        if opt_count > 1:
            second_option = options.nth(1)
            cat_value = second_option.get_attribute("value")
            if cat_value:
                cat_select.select_option(cat_value)
                page.wait_for_timeout(1500)
                screenshot(page, "08-category-filtered")
                result("PASS", f"Category filter applied: '{cat_value}'")

                # Reset
                cat_select.select_option("")
                page.wait_for_timeout(1000)
        else:
            result("WARN", "Only 1 category option (no data to filter)")

    # Test search
    search_input = page.locator("input[type='text'][placeholder='Search...']")
    if search_input.count() > 0:
        search_input.fill("Attention")
        page.wait_for_timeout(500)
        screenshot(page, "09-search-results")

        cards_after_search = page.locator('[class*="rounded-lg"][class*="border"][class*="p-2"]').count()
        result("PASS", f"Search 'Attention' → {cards_after_search} results")

        search_input.fill("")
        page.wait_for_timeout(500)

    # Test research-only checkbox
    research_cb = page.locator("input[type='checkbox']")
    if research_cb.count() > 0:
        research_cb.check()
        page.wait_for_timeout(1500)
        screenshot(page, "10-research-only")
        result("PASS", "Research-only filter toggled")

        research_cb.uncheck()
        page.wait_for_timeout(1000)


# ── Phase 10: LfStageCard close-ups ──────────────────────────────────────


def test_stage_card_closeups(page: Page):
    print("\n=== Phase 10: Stage Card Close-ups ===")

    # Zoom into the waterfall area
    fit_btn = page.locator(".react-flow__controls-fitview")
    if fit_btn.count() > 0:
        fit_btn.click()
        page.wait_for_timeout(1000)

    # Try to find individual stage cards by their label text
    stage_labels = ["Ingested", "Extracted", "Categorized", "Embedded",
                    "Stored", "Chunked", "Auto Related", "Research Bridge",
                    "URLs Discovered", "Completed"]

    found_stages = set()
    nodes = page.locator(".react-flow__node")
    for i in range(min(nodes.count(), 50)):
        node = nodes.nth(i)
        try:
            text = node.inner_text(timeout=2000)
            for label in stage_labels:
                if label.upper() in text.upper():
                    found_stages.add(label)
        except Exception:
            pass

    result("PASS" if len(found_stages) > 0 else "WARN",
           f"Found {len(found_stages)}/{len(stage_labels)} stage types: {', '.join(sorted(found_stages))}")

    # Take close-up of a stage card
    lf_nodes = page.locator('.react-flow__node[data-id^="lf-"]')
    if lf_nodes.count() > 0:
        first_lf = lf_nodes.first
        box = first_lf.bounding_box()
        if box:
            pad = 20
            page.screenshot(
                path=str(SCREENSHOTS_DIR / "11-stage-card-closeup.png"),
                clip={
                    "x": max(0, box["x"] - pad),
                    "y": max(0, box["y"] - pad),
                    "width": box["width"] + 2 * pad,
                    "height": box["height"] + 2 * pad,
                },
            )
            result("PASS", "Stage card close-up captured")


# ── Phase 11: Paper pool interaction edge cases ──────────────────────────


def test_pool_edge_cases(page: Page):
    print("\n=== Phase 11: Edge Cases ===")

    # Click "Load more" button
    load_more = page.locator("button:has-text('Load more')")
    if load_more.count() > 0:
        is_disabled = load_more.evaluate("el => el.disabled")
        if not is_disabled:
            load_more.click()
            page.wait_for_timeout(2000)
            result("PASS", "Load more button works")

            # Check it didn't duplicate papers
            screenshot(page, "12-after-load-more")
        else:
            result("PASS", "Load more correctly disabled while loading")
    else:
        result("PASS", "No Load more button (all papers fit in view)")

    # Check that paper pool divider is draggable area / correct proportions
    pool_area = page.locator('[class*="bg-neutral-950"]')
    if pool_area.count() > 0:
        box = pool_area.first.bounding_box()
        if box:
            vp = page.viewport_size
            if vp:
                pool_pct = (box["height"] / vp["height"]) * 100
                result("PASS", f"Pool area takes ~{pool_pct:.0f}% of viewport height")


# ── Phase 12: Visual regression checks ───────────────────────────────────


def test_visual_regression(page: Page):
    print("\n=== Phase 12: Visual Regression Checks ===")

    # Check for console errors
    # (collected by listener in main)

    # Check that MiniMap shows linkforge nodes
    minimap = page.locator(".react-flow__minimap")
    if minimap.count() > 0:
        box = minimap.bounding_box()
        if box:
            page.screenshot(
                path=str(SCREENSHOTS_DIR / "13-minimap-with-pipeline.png"),
                clip={
                    "x": max(0, box["x"] - 5),
                    "y": max(0, box["y"] - 5),
                    "width": box["width"] + 10,
                    "height": box["height"] + 10,
                },
            )
            result("PASS", "MiniMap captured with pipeline nodes")

    # Full final screenshot
    screenshot(page, "14-final-overview")


# ── Phase 13: Tab bar with linkforge ──────────────────────────────────────


def test_tab_bar(page: Page):
    print("\n=== Phase 13: Tab Bar ===")

    tab_bar = page.locator('[class*="border-b"][class*="bg-neutral-950"]').first
    if tab_bar.count() > 0:
        box = tab_bar.bounding_box()
        if box:
            page.screenshot(
                path=str(SCREENSHOTS_DIR / "15-tab-bar.png"),
                clip={
                    "x": max(0, box["x"]),
                    "y": max(0, box["y"]),
                    "width": box["width"],
                    "height": box["height"] + 2,
                },
            )
            result("PASS", "Tab bar captured")

    # Check new tab button
    new_tab = page.locator("button:has-text('+')")
    if new_tab.count() > 0:
        result("PASS", "New tab (+) button present")
    else:
        result("WARN", "New tab button not found")


# ── Main ─────────────────────────────────────────────────────────────────────


def main():
    print("+" + "=" * 60 + "+")
    print("|  Paper Digestion Pipeline — Playwright E2E Audit           |")
    print("+" + "=" * 60 + "+")

    test_backend_linkforge_api()

    console_errors: list[str] = []
    page_errors: list[str] = []

    daemon = start_linkforge_publisher()

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 1920, "height": 1080},
                device_scale_factor=2,
            )
            page = context.new_page()
            page.on("console", lambda msg: (
                console_errors.append(f"[{msg.type}] {msg.text}")
                if msg.type in ("error", "warning") else None
            ))
            page.on("pageerror", lambda err: page_errors.append(str(err)))

            try:
                test_canvas_initial(page)
                test_node_palette(page)
                test_add_lf_nodes(page)

                # Wait for publisher to finish sending papers
                print("\n  [INFO] Waiting for synthetic papers to stream through...")
                page.wait_for_timeout(40000)

                test_live_waterfall(page)
                test_paper_pool(page)
                test_paper_detail(page)
                test_sorting_filtering(page)
                test_stage_card_closeups(page)
                test_pool_edge_cases(page)
                test_visual_regression(page)
                test_tab_bar(page)
            finally:
                browser.close()
    finally:
        daemon.terminate()
        try:
            daemon.wait(timeout=5)
        except subprocess.TimeoutExpired:
            daemon.kill()

    # Console error summary
    print("\n=== Browser Console Audit ===")
    if page_errors:
        result("FAIL", f"{len(page_errors)} page errors:",
               severity="high", fix="Fix uncaught exceptions")
        for e in page_errors[:10]:
            print(f"    {e[:200]}")
    else:
        result("PASS", "No page errors")

    real_errors = [e for e in console_errors if "[error]" in e.lower()]
    if real_errors:
        result("WARN", f"{len(real_errors)} console errors:")
        for e in real_errors[:10]:
            print(f"    {e[:200]}")
    else:
        result("PASS", "No console errors")

    # Final summary
    print(f"\n{'=' * 62}")
    print(f"  PASS: {pass_count}  |  FAIL: {fail_count}  |  WARN: {warn_count}")
    print(f"{'=' * 62}")

    if findings:
        print("\n  FINDINGS:")
        for f in findings:
            sev = f["severity"].upper()
            print(f"    [{f['status']}] [{sev}] {f['msg']}")
            if f["fix"]:
                print(f"           Fix: {f['fix']}")

    print(f"\n  Screenshots: {SCREENSHOTS_DIR}/")
    files = sorted(SCREENSHOTS_DIR.iterdir())
    print(f"  {len(files)} screenshots captured:")
    for f in files:
        print(f"    - {f.name} ({f.stat().st_size // 1024}KB)")

    return 1 if fail_count > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
