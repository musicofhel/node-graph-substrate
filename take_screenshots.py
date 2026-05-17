#!/usr/bin/env python3
"""Walk through the node-graph-substrate UI and capture gallery screenshots.

Covers all 3 canvas types, detail panel, event log, and individual nodes.
Assumes services are running: docker compose up, npm run dev,
synthetic_daemon.py, and synthetic_linkforge.py (for Research canvas data).
"""

import asyncio
import os

from playwright.async_api import async_playwright

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


async def screenshot_node(page, node, filename, dest=SHOTS):
    """Take a padded screenshot of a single node via page clip."""
    box = await node.bounding_box()
    if box:
        pad = 30
        vp = page.viewport_size
        await page.screenshot(
            path=f"{dest}/{filename}.png",
            clip={
                "x": max(0, box["x"] - pad),
                "y": max(0, box["y"] - pad),
                "width": min(box["width"] + 2 * pad, vp["width"]),
                "height": min(box["height"] + 2 * pad, vp["height"]),
            },
        )
        return True
    return False


async def click_tab(page, tab_name: str):
    """Click a canvas tab by name."""
    tab = page.locator(f'button:has-text("{tab_name}"), [role="tab"]:has-text("{tab_name}")').first
    if await tab.count() > 0:
        await tab.click()
        await asyncio.sleep(2)
        return True
    return False


async def fit_view(page):
    """Click the React Flow fit-view control (not zoom-in)."""
    fit_btn = page.locator(".react-flow__controls-fitview")
    if await fit_btn.count() > 0:
        await fit_btn.click(force=True)
        await asyncio.sleep(1)


async def hide_minimap(page):
    """Hide the MiniMap to prevent it from overlapping content in screenshots."""
    await page.evaluate(
        'document.querySelector(".react-flow__minimap")?.style.setProperty("display", "none")'
    )


async def show_minimap(page):
    """Restore the MiniMap after screenshots."""
    await page.evaluate(
        'document.querySelector(".react-flow__minimap")?.style.setProperty("display", "")'
    )


async def hide_palette(page):
    """Hide the NodePalette sidebar so it doesn't overlap node screenshots."""
    await page.evaluate('''
        const el = document.querySelector('.shrink-0.overflow-y-auto.border-r');
        if (el) el.style.display = 'none';
    ''')


async def show_palette(page):
    """Restore the NodePalette sidebar."""
    await page.evaluate('''
        const el = document.querySelector('.shrink-0.overflow-y-auto.border-r');
        if (el) el.style.display = '';
    ''')


async def main():
    os.makedirs(SHOTS, exist_ok=True)
    os.makedirs(f"{SHOTS}/detail-panel", exist_ok=True)
    os.makedirs(f"{SHOTS}/paper-pipeline", exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=2,
        )
        page = await ctx.new_page()

        # ── Load app ──
        print("Loading canvas...")
        await page.goto(FRONTEND)
        await page.wait_for_selector(".react-flow__node", timeout=15000)
        await asyncio.sleep(5)

        # ── Pipeline Canvas ──
        print("\n=== Pipeline Canvas ===")
        await hide_minimap(page)
        await fit_view(page)
        await asyncio.sleep(1)
        await page.screenshot(path=f"{SHOTS}/20-pipeline-canvas.png")
        print("  ✓ 20-pipeline-canvas.png")

        # Live streaming data view (same canvas, separate shot for README)
        await page.screenshot(path=f"{SHOTS}/06-fit-view-with-data.png")
        print("  ✓ 06-fit-view-with-data.png")

        # Individual pipeline node close-ups (with live data)
        await hide_palette(page)
        await asyncio.sleep(0.5)
        await fit_view(page)
        await asyncio.sleep(1)
        nodes = await page.query_selector_all(".react-flow__node")
        for node in nodes:
            inner_text = (await node.inner_text()).lower()
            classes = await node.get_attribute("class") or ""
            for type_key, filename in PIPELINE_NODES.items():
                type_readable = type_key.replace("_", " ")
                if type_readable in inner_text or type_key in classes:
                    if await screenshot_node(page, node, filename):
                        print(f"  ✓ {filename}.png")
                    break

        # Live data close-ups with numbered prefix
        for node in nodes:
            inner_text = (await node.inner_text()).lower()
            classes = await node.get_attribute("class") or ""
            for type_key in PIPELINE_NODES:
                type_readable = type_key.replace("_", " ")
                if type_readable in inner_text or type_key in classes:
                    idx = list(PIPELINE_NODES.keys()).index(type_key) + 1
                    filename = f"07{idx:02d}-{type_key}-live"
                    if await screenshot_node(page, node, filename):
                        print(f"  ✓ {filename}.png")
                    break
        await show_palette(page)

        # ── Detail Panel — click a node to open it ──
        print("\n=== Detail Panel ===")
        await fit_view(page)
        await asyncio.sleep(1)
        gauge_node = page.locator('.react-flow__node:has-text("Confidence")').first
        if await gauge_node.count() > 0:
            await gauge_node.scroll_into_view_if_needed()
            await asyncio.sleep(0.5)
            await gauge_node.click(force=True)
            await asyncio.sleep(1.5)

            # Overview tab (default)
            await page.screenshot(path=f"{SHOTS}/detail-panel/dp-01-overview.png")
            print("  ✓ dp-01-overview.png")

            # Series tab
            series_tab = page.locator('button:has-text("Series")').first
            if await series_tab.count() > 0:
                await series_tab.click()
                await asyncio.sleep(2)
                await page.screenshot(path=f"{SHOTS}/detail-panel/dp-02-timeseries.png")
                print("  ✓ dp-02-timeseries.png")

            # Config tab
            config_tab = page.locator('button:has-text("Config")').first
            if await config_tab.count() > 0:
                await config_tab.click()
                await asyncio.sleep(1.5)
                await page.screenshot(path=f"{SHOTS}/detail-panel/dp-03-config.png")
                print("  ✓ dp-03-config.png")

            # Drift tab
            drift_tab = page.locator('button:has-text("Drift")').first
            if await drift_tab.count() > 0:
                await drift_tab.click()
                await asyncio.sleep(3)
                await page.screenshot(path=f"{SHOTS}/detail-panel/dp-04-drift.png")
                print("  ✓ dp-04-drift.png")

            # Deselect
            await page.locator(".react-flow__pane").click()
            await asyncio.sleep(0.5)

        # ── Tab Bar close-up ──
        print("\n=== Tab Bar ===")
        tabbar = page.locator('[class*="tab-bar"], [class*="TabBar"], [role="tablist"]').first
        if await tabbar.count() > 0:
            box = await tabbar.bounding_box()
            if box:
                pad = 10
                await page.screenshot(
                    path=f"{SHOTS}/23-tab-bar.png",
                    clip={
                        "x": max(0, box["x"] - pad),
                        "y": max(0, box["y"] - pad),
                        "width": box["width"] + 2 * pad,
                        "height": box["height"] + 2 * pad,
                    },
                )
                print("  ✓ 23-tab-bar.png")
        else:
            print("  ⚠ TabBar not found by selector, trying by text")
            tab_area = page.locator('button:has-text("Pipeline")').first
            if await tab_area.count() > 0:
                box = await tab_area.bounding_box()
                if box:
                    await page.screenshot(
                        path=f"{SHOTS}/23-tab-bar.png",
                        clip={"x": 0, "y": max(0, box["y"] - 5), "width": 600, "height": 50},
                    )
                    print("  ✓ 23-tab-bar.png (fallback)")

        # ── Research Canvas ──
        print("\n=== Research Canvas ===")
        if await click_tab(page, "Research"):
            await asyncio.sleep(3)
            await fit_view(page)
            await asyncio.sleep(1)
            await page.screenshot(path=f"{SHOTS}/21-research-canvas.png")
            print("  ✓ 21-research-canvas.png")

            # Check for waiting state
            waiting = await page.locator(':text("Waiting for")').count()
            if waiting > 2:
                print("  ⚠ Research nodes still showing 'Waiting for...' — is synthetic_linkforge.py running?")

            # ── Paper Pool screenshot ──
            paper_pool = page.locator('[class*="paper-pool"], [class*="PaperPool"]').first
            if await paper_pool.count() > 0:
                box = await paper_pool.bounding_box()
                if box:
                    pad = 5
                    await page.screenshot(
                        path=f"{SHOTS}/paper-pipeline/04-paper-pool.png",
                        clip={
                            "x": max(0, box["x"] - pad),
                            "y": max(0, box["y"] - pad),
                            "width": box["width"] + 2 * pad,
                            "height": min(box["height"] + 2 * pad, 500),
                        },
                    )
                    print("  ✓ paper-pipeline/04-paper-pool.png")

                # Click first paper card for detail view
                paper_card = page.locator('[class*="paper-card"], [class*="PaperCard"]').first
                if await paper_card.count() > 0:
                    await paper_card.click()
                    await asyncio.sleep(1.5)
                    detail = page.locator('[class*="paper-detail"], [class*="PaperDetail"]').first
                    if await detail.count() > 0:
                        detail_box = await detail.bounding_box()
                        if detail_box:
                            pad = 10
                            await page.screenshot(
                                path=f"{SHOTS}/paper-pipeline/06-paper-detail-closeup.png",
                                clip={
                                    "x": max(0, detail_box["x"] - pad),
                                    "y": max(0, detail_box["y"] - pad),
                                    "width": detail_box["width"] + 2 * pad,
                                    "height": detail_box["height"] + 2 * pad,
                                },
                            )
                            print("  ✓ paper-pipeline/06-paper-detail-closeup.png")
        else:
            print("  ⚠ Research tab not found")

        # ── Research v2 Canvas ──
        print("\n=== Research v2 Canvas ===")
        if await click_tab(page, "Research v2"):
            await asyncio.sleep(3)
            await fit_view(page)
            await asyncio.sleep(1)
            await page.screenshot(path=f"{SHOTS}/22-research-v2-canvas.png")
            print("  ✓ 22-research-v2-canvas.png")
        else:
            print("  ⚠ Research v2 tab not found")

        # ── Switch back to Pipeline for remaining shots ──
        await click_tab(page, "Pipeline")
        await fit_view(page)
        await asyncio.sleep(1)

        # ── Resizable node handles ──
        print("\n=== Feature Screenshots ===")
        first_node = page.locator(".react-flow__node").first
        if await first_node.count() > 0:
            await first_node.click()
            await asyncio.sleep(0.5)
            if await screenshot_node(page, first_node, "30-resizable-node"):
                print("  ✓ 30-resizable-node.png")
            await page.locator(".react-flow__pane").click()

        # ── Event Log ──
        event_log = page.locator('[class*="event-log"], [class*="EventLog"]').first
        if await event_log.count() > 0:
            box = await event_log.bounding_box()
            if box:
                pad = 5
                await page.screenshot(
                    path=f"{SHOTS}/32-event-log.png",
                    clip={
                        "x": max(0, box["x"] - pad),
                        "y": max(0, box["y"] - pad),
                        "width": box["width"] + 2 * pad,
                        "height": min(box["height"] + 2 * pad, 400),
                    },
                )
                print("  ✓ 32-event-log.png")

        # ── Prompt interaction ──
        print("\n=== Compute Path ===")
        textarea = page.locator("textarea").first
        if await textarea.count() > 0:
            await textarea.click()
            await textarea.fill("What is the meaning of consciousness?")
            await asyncio.sleep(0.5)
            await page.screenshot(path=f"{SHOTS}/10-prompt-entered.png")
            print("  ✓ 10-prompt-entered.png")

            analyze_btn = page.locator("button", has_text="Analyze")
            if await analyze_btn.count() > 0:
                await analyze_btn.first.click()
                await asyncio.sleep(3)
                await page.screenshot(path=f"{SHOTS}/11-after-analyze.png")
                print("  ✓ 11-after-analyze.png")

        await show_minimap(page)
        await browser.close()

    # Summary
    total = 0
    for dirpath, _, filenames in os.walk(SHOTS):
        pngs = [f for f in filenames if f.endswith(".png")]
        total += len(pngs)
    print(f"\n✅ Done — {total} total screenshots in {SHOTS}/")


if __name__ == "__main__":
    asyncio.run(main())
