#!/usr/bin/env python3
"""Walk through the node-graph-substrate UI and capture gallery screenshots.

Uses window.__canvasStore and window.__rfInstance (exposed in dev mode via
App.tsx and SubstrateCanvas.tsx) to position nodes and control the viewport.

Covers all 3 canvas types, detail panel, and individual nodes.
Assumes services are running: docker compose up, npm run dev,
synthetic_daemon.py, and synthetic_linkforge.py (for Research canvas data).
"""

import asyncio
import os

from playwright.async_api import async_playwright, Page

FRONTEND = "http://localhost:5173"
SHOTS = "/home/musicofhel/node-graph-substrate/docs/screenshots"

PIPELINE_NODES = {
    "prompt_input": "04a-prompt-input-node",
    "hidden_state_cloud": "04b-hidden-state-cloud-node",
    "feature_bars": "04c-feature-bars-node",
    "persistence_diagram": "04d-persistence-diagram-node",
    "confidence_gauge": "04e-confidence-gauge-node",
    "bridge_monitor": "04f-bridge-monitor-node",
    "explain_waterfall": "04g-explain-waterfall-node",
    "drift_matrix": "04h-drift-matrix-node",
}


async def grid_layout_via_store(page: Page, cols=2, col_w=400, row_h=350, start_x=50, start_y=50):
    """Set node positions to a grid and fix corrupted measured sizes.

    The Hidden State Cloud node's Three.js canvas reports a measured width
    of 33M px, which breaks fitView. This caps all measured dimensions.
    """
    await page.evaluate(f"""() => {{
        const store = window.__canvasStore;
        if (!store) return;
        const nodes = store.getState().nodes;
        const MAX_MEASURED = 2000;
        const updated = nodes.map((n, i) => {{
            const measured = n.measured ? {{ ...n.measured }} : undefined;
            if (measured) {{
                if (measured.width > MAX_MEASURED) measured.width = 280;
                if (measured.height > MAX_MEASURED) measured.height = 180;
            }}
            return {{
                ...n,
                measured,
                position: {{
                    x: {start_x} + (i % {cols}) * {col_w},
                    y: {start_y} + Math.floor(i / {cols}) * {row_h}
                }}
            }};
        }});
        store.setState({{ nodes: updated }});
    }}""")
    await asyncio.sleep(1.5)


async def fit_view_rf(page: Page, max_zoom=1.0, padding=0.15):
    """Call fitView via the exposed React Flow instance."""
    await page.evaluate(f"""() => {{
        const rf = window.__rfInstance;
        if (rf) rf.fitView({{ padding: {padding}, maxZoom: {max_zoom}, duration: 300 }});
    }}""")
    await asyncio.sleep(1)


async def set_viewport_rf(page: Page, x: float, y: float, zoom: float):
    """Set viewport position directly via React Flow instance."""
    await page.evaluate(f"""() => {{
        const rf = window.__rfInstance;
        if (rf) rf.setViewport({{ x: {x}, y: {y}, zoom: {zoom} }}, {{ duration: 300 }});
    }}""")
    await asyncio.sleep(1)


async def click_tab(page: Page, tab_name: str):
    tab = page.locator(f'button:has-text("{tab_name}")').first
    if await tab.count() > 0:
        await tab.click()
        await asyncio.sleep(3)
        return True
    return False


async def hide_minimap(page: Page):
    await page.evaluate(
        'document.querySelector(".react-flow__minimap")?.style.setProperty("display", "none")'
    )


async def hide_palette(page: Page):
    await page.evaluate("""
        const el = document.querySelector('.shrink-0.overflow-y-auto.border-r');
        if (el) el.style.display = 'none';
    """)


async def show_palette(page: Page):
    await page.evaluate("""
        const el = document.querySelector('.shrink-0.overflow-y-auto.border-r');
        if (el) el.style.display = '';
    """)


async def screenshot_node(page: Page, node, filename, dest=SHOTS):
    box = await node.bounding_box()
    if box:
        pad = 30
        vp = page.viewport_size
        x = max(0, box["x"] - pad)
        y = max(0, box["y"] - pad)
        w = min(box["width"] + 2 * pad, vp["width"] - x)
        h = min(box["height"] + 2 * pad, vp["height"] - y)
        if w <= 0 or h <= 0:
            print(f"  ⚠ {filename} — node out of viewport")
            return False
        await page.screenshot(
            path=f"{dest}/{filename}.png",
            clip={"x": x, "y": y, "width": w, "height": h},
        )
        return True
    return False


async def main():
    os.makedirs(SHOTS, exist_ok=True)
    os.makedirs(f"{SHOTS}/detail-panel", exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=2,
        )
        page = await ctx.new_page()

        print("Loading canvas...")
        await page.goto(FRONTEND)
        await page.wait_for_selector(".react-flow__node", timeout=15000)
        await asyncio.sleep(5)

        has_store = await page.evaluate("() => !!window.__canvasStore")
        has_rf = await page.evaluate("() => !!window.__rfInstance")
        print(f"  Store: {has_store}, RF instance: {has_rf}")

        if not has_store or not has_rf:
            print("ERROR: __canvasStore or __rfInstance not available on window.")
            print("       Ensure frontend is running in dev mode (npm run dev).")
            await browser.close()
            return

        # ── Pipeline Canvas ──
        print("\n=== Pipeline Canvas ===")
        await hide_minimap(page)
        await grid_layout_via_store(page, cols=3, col_w=350, row_h=300, start_x=50, start_y=50)
        await set_viewport_rf(page, x=140, y=20, zoom=0.8)

        await page.screenshot(path=f"{SHOTS}/20-pipeline-canvas.png")
        print("  ✓ 20-pipeline-canvas.png")
        await page.screenshot(path=f"{SHOTS}/06-fit-view-with-data.png")
        print("  ✓ 06-fit-view-with-data.png")

        # Individual pipeline node close-ups
        await hide_palette(page)
        await asyncio.sleep(0.5)

        nodes = await page.query_selector_all(".react-flow__node")
        print(f"  Found {len(nodes)} nodes")

        for node in nodes:
            inner_text = (await node.inner_text()).lower()
            classes = await node.get_attribute("class") or ""
            data_id = await node.get_attribute("data-id") or ""
            for type_key, filename in PIPELINE_NODES.items():
                type_readable = type_key.replace("_", " ")
                if type_readable in inner_text or type_key in classes:
                    await page.evaluate(f"""() => {{
                        window.__rfInstance?.fitView({{
                            nodes: [{{ id: '{data_id}' }}],
                            padding: 0.3, maxZoom: 1.5, duration: 200
                        }});
                    }}""")
                    await asyncio.sleep(0.8)
                    if await screenshot_node(page, node, filename):
                        print(f"  ✓ {filename}.png")
                    break

        # Numbered live close-ups (same nodes, different filenames)
        for node in nodes:
            inner_text = (await node.inner_text()).lower()
            classes = await node.get_attribute("class") or ""
            data_id = await node.get_attribute("data-id") or ""
            for type_key in PIPELINE_NODES:
                type_readable = type_key.replace("_", " ")
                if type_readable in inner_text or type_key in classes:
                    idx = list(PIPELINE_NODES.keys()).index(type_key) + 1
                    filename = f"07{idx:02d}-{type_key}-live"
                    await page.evaluate(f"""() => {{
                        window.__rfInstance?.fitView({{
                            nodes: [{{ id: '{data_id}' }}],
                            padding: 0.3, maxZoom: 1.5, duration: 200
                        }});
                    }}""")
                    await asyncio.sleep(0.8)
                    if await screenshot_node(page, node, filename):
                        print(f"  ✓ {filename}.png")
                    break

        await show_palette(page)

        # ── Detail Panel ──
        print("\n=== Detail Panel ===")
        await page.evaluate("""() => {
            window.__rfInstance?.fitView({
                nodes: [{ id: 'gauge-1' }], padding: 0.3, maxZoom: 1.0, duration: 200
            });
        }""")
        await asyncio.sleep(1)
        gauge_node = page.locator('.react-flow__node:has-text("Confidence")').first
        if await gauge_node.count() > 0:
            await gauge_node.dispatch_event("click")
            await asyncio.sleep(1.5)

            await fit_view_rf(page, max_zoom=0.6, padding=0.05)
            await asyncio.sleep(0.5)
            await page.screenshot(path=f"{SHOTS}/detail-panel/dp-01-overview.png")
            print("  ✓ dp-01-overview.png")

            for tab_name, fname, wait in [
                ("Series", "dp-02-timeseries", 2),
                ("Config", "dp-03-config", 1.5),
                ("Drift", "dp-04-drift", 3),
            ]:
                tab = page.locator(f'button:has-text("{tab_name}")').first
                if await tab.count() > 0:
                    await tab.click()
                    await asyncio.sleep(wait)
                    await page.screenshot(path=f"{SHOTS}/detail-panel/{fname}.png")
                    print(f"  ✓ {fname}.png")

            await page.locator(".react-flow__pane").click()
            await asyncio.sleep(0.5)

        # ── Tab Bar ──
        print("\n=== Tab Bar ===")
        tab_btn = page.locator('button:has-text("Pipeline")').first
        if await tab_btn.count() > 0:
            box = await tab_btn.bounding_box()
            if box:
                await page.screenshot(
                    path=f"{SHOTS}/23-tab-bar.png",
                    clip={"x": 0, "y": max(0, box["y"] - 5), "width": 600, "height": 50},
                )
                print("  ✓ 23-tab-bar.png")

        # ── Research Canvas ──
        print("\n=== Research Canvas ===")
        if await click_tab(page, "Research"):
            await asyncio.sleep(3)
            await grid_layout_via_store(page, cols=2, col_w=450, row_h=300)
            await fit_view_rf(page, max_zoom=0.8, padding=0.1)
            await page.screenshot(path=f"{SHOTS}/21-research-canvas.png")
            print("  ✓ 21-research-canvas.png")

            waiting = await page.locator(':text("Waiting for")').count()
            if waiting > 2:
                print(f"  ⚠ {waiting} nodes showing 'Waiting for...' — is synthetic_linkforge.py running?")

        # ── Research v2 Canvas ──
        print("\n=== Research v2 Canvas ===")
        if await click_tab(page, "Research v2"):
            await asyncio.sleep(3)
            await grid_layout_via_store(page, cols=2, col_w=450, row_h=300)
            await fit_view_rf(page, max_zoom=0.8, padding=0.1)
            await page.screenshot(path=f"{SHOTS}/22-research-v2-canvas.png")
            print("  ✓ 22-research-v2-canvas.png")

        # ── Back to Pipeline for remaining shots ──
        await click_tab(page, "Pipeline")
        await asyncio.sleep(2)
        await grid_layout_via_store(page, cols=3, col_w=350, row_h=300)

        # Prompt interaction
        print("\n=== Compute Path ===")
        await page.evaluate("""() => {
            window.__rfInstance?.fitView({
                nodes: [{ id: 'prompt-1' }], padding: 0.2, maxZoom: 1.5, duration: 200
            });
        }""")
        await asyncio.sleep(1)
        textarea = page.locator("textarea").first
        if await textarea.count() > 0:
            await textarea.click(force=True)
            await textarea.fill("What is the meaning of consciousness?")
            await asyncio.sleep(0.5)
            await page.screenshot(path=f"{SHOTS}/10-prompt-entered.png")
            print("  ✓ 10-prompt-entered.png")

            analyze_btn = page.locator("button", has_text="Analyze")
            if await analyze_btn.count() > 0:
                await analyze_btn.first.click(force=True)
                await asyncio.sleep(3)
                await fit_view_rf(page, max_zoom=0.8, padding=0.1)
                await asyncio.sleep(0.5)
                await page.screenshot(path=f"{SHOTS}/11-after-analyze.png")
                print("  ✓ 11-after-analyze.png")

        # Resizable node
        print("\n=== Feature Screenshots ===")
        first_node = page.locator(".react-flow__node").first
        if await first_node.count() > 0:
            await first_node.click(force=True)
            await asyncio.sleep(0.5)
            if await screenshot_node(page, first_node, "30-resizable-node"):
                print("  ✓ 30-resizable-node.png")
            await page.locator(".react-flow__pane").click()

        await browser.close()

    total = sum(1 for _, _, fns in os.walk(SHOTS) for f in fns if f.endswith(".png"))
    print(f"\nDone — {total} total screenshots in {SHOTS}/")


if __name__ == "__main__":
    asyncio.run(main())
