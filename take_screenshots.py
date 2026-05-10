#!/usr/bin/env python3
"""Walk through the node-graph-substrate UI and capture gallery screenshots."""

import asyncio
import subprocess
import time

from playwright.async_api import async_playwright

FRONTEND = "http://localhost:5173"
SHOTS = "/home/musicofhel/node-graph-substrate/docs/screenshots"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=2,
        )
        page = await ctx.new_page()

        # ── 1. Full canvas — initial load ──
        print("1. Loading canvas...")
        await page.goto(FRONTEND)
        await page.wait_for_selector(".react-flow__node", timeout=15000)
        await asyncio.sleep(2)
        await page.screenshot(path=f"{SHOTS}/01-full-canvas.png")
        print("   ✓ Full canvas with all nodes + sidebar")

        # ── 2. Fit view to show all nodes cleanly ──
        print("2. Fitting view...")
        fit_btn = page.locator(".react-flow__controls button").first
        await fit_btn.click()
        await asyncio.sleep(1)
        await page.screenshot(path=f"{SHOTS}/02-fit-view.png")
        print("   ✓ Fit view")

        # ── 3. Node palette / sidebar ──
        print("3. Sidebar close-up...")
        sidebar = page.locator('[class*="sidebar"], [class*="palette"], [class*="Palette"]').first
        if await sidebar.count() > 0:
            box = await sidebar.bounding_box()
            if box:
                await page.screenshot(
                    path=f"{SHOTS}/03-node-palette.png",
                    clip={"x": box["x"], "y": box["y"], "width": box["width"] + 20, "height": min(box["height"], 900)},
                )
                print("   ✓ Node palette sidebar")
        else:
            print("   ⚠ Sidebar not found, taking full page")
            await page.screenshot(path=f"{SHOTS}/03-node-palette.png")

        # ── 4. Individual node close-ups ──
        node_types = {
            "prompt_input": "04a-prompt-input-node",
            "hidden_state_cloud": "04b-hidden-state-cloud-node",
            "feature_bars": "04c-feature-bars-node",
            "persistence_diagram": "04d-persistence-diagram-node",
            "confidence_gauge": "04e-confidence-gauge-node",
            "bridge_monitor": "04f-bridge-monitor-node",
            "explain_waterfall": "04g-explain-waterfall-node",
        }
        print("4. Individual node screenshots...")
        nodes = await page.query_selector_all(".react-flow__node")
        for node in nodes:
            data_id = await node.get_attribute("data-id")
            # Get the type from the node's class or data attribute
            classes = await node.get_attribute("class") or ""
            # Try to determine node type
            inner_text = await node.inner_text()
            inner_text_lower = inner_text.lower()

            matched_name = None
            for type_key, filename in node_types.items():
                type_readable = type_key.replace("_", " ")
                if type_readable in inner_text_lower or type_key in classes:
                    matched_name = filename
                    break

            if not matched_name:
                # Fallback: use first line of text
                first_line = inner_text.split("\n")[0][:30].strip()
                matched_name = f"04x-{first_line.lower().replace(' ', '-')}"

            box = await node.bounding_box()
            if box:
                pad = 15
                await page.screenshot(
                    path=f"{SHOTS}/{matched_name}.png",
                    clip={
                        "x": max(0, box["x"] - pad),
                        "y": max(0, box["y"] - pad),
                        "width": box["width"] + 2 * pad,
                        "height": box["height"] + 2 * pad,
                    },
                )
                print(f"   ✓ {matched_name}")

        # ── 5. Start synthetic daemon for live data ──
        print("5. Starting synthetic daemon for live streaming data...")
        daemon = subprocess.Popen(
            ["python3", "/home/musicofhel/node-graph-substrate/synthetic_daemon.py"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        await asyncio.sleep(6)  # Wait for 3 cycles of data

        # ── 6. Canvas with live streaming data ──
        print("6. Canvas with live data...")
        await page.screenshot(path=f"{SHOTS}/05-live-streaming-data.png")
        print("   ✓ Full canvas with live streaming data")

        # ── 7. Fit view with data ──
        await fit_btn.click()
        await asyncio.sleep(1)
        await page.screenshot(path=f"{SHOTS}/06-fit-view-with-data.png")
        print("   ✓ Fit view with streaming data")

        # ── 8. Close-ups of nodes with live data ──
        print("7. Node close-ups with live data...")
        nodes = await page.query_selector_all(".react-flow__node")
        for node in nodes:
            inner_text = await node.inner_text()
            inner_text_lower = inner_text.lower()

            matched_name = None
            for type_key, _ in node_types.items():
                type_readable = type_key.replace("_", " ")
                if type_readable in inner_text_lower or type_key in (await node.get_attribute("class") or ""):
                    matched_name = f"07{list(node_types.keys()).index(type_key) + 1:02d}-{type_key}-live"
                    break

            if not matched_name:
                continue

            box = await node.bounding_box()
            if box:
                pad = 15
                await page.screenshot(
                    path=f"{SHOTS}/{matched_name}.png",
                    clip={
                        "x": max(0, box["x"] - pad),
                        "y": max(0, box["y"] - pad),
                        "width": box["width"] + 2 * pad,
                        "height": box["height"] + 2 * pad,
                    },
                )
                print(f"   ✓ {matched_name}")

        # ── 9. Zoomed in view ──
        print("8. Zoomed views...")
        zoom_in = page.locator(".react-flow__controls button").nth(1)
        for _ in range(3):
            await zoom_in.click()
            await asyncio.sleep(0.3)
        await asyncio.sleep(0.5)
        await page.screenshot(path=f"{SHOTS}/08-zoomed-in.png")
        print("   ✓ Zoomed in")

        # ── 10. Zoom out to see full graph ──
        zoom_out = page.locator(".react-flow__controls button").nth(2)
        for _ in range(6):
            await zoom_out.click()
            await asyncio.sleep(0.3)
        await asyncio.sleep(0.5)
        await page.screenshot(path=f"{SHOTS}/09-zoomed-out.png")
        print("   ✓ Zoomed out")

        # ── 11. Fit view again, then interact with prompt input ──
        print("9. Compute path — prompt input interaction...")
        await fit_btn.click()
        await asyncio.sleep(1)

        # Find the prompt input textarea
        textarea = page.locator("textarea").first
        if await textarea.count() > 0:
            await textarea.click()
            await textarea.fill("What is the meaning of consciousness?")
            await asyncio.sleep(0.5)
            await page.screenshot(path=f"{SHOTS}/10-prompt-entered.png")
            print("   ✓ Prompt entered")

            # Click Analyze button
            analyze_btn = page.locator("button", has_text="Analyze")
            if await analyze_btn.count() > 0:
                await analyze_btn.first.click()
                await asyncio.sleep(2)
                await page.screenshot(path=f"{SHOTS}/11-after-analyze.png")
                print("   ✓ After Analyze click")

        # ── 12. MiniMap close-up ──
        print("10. MiniMap...")
        minimap = page.locator(".react-flow__minimap")
        if await minimap.count() > 0:
            box = await minimap.bounding_box()
            if box:
                pad = 5
                await page.screenshot(
                    path=f"{SHOTS}/12-minimap.png",
                    clip={
                        "x": max(0, box["x"] - pad),
                        "y": max(0, box["y"] - pad),
                        "width": box["width"] + 2 * pad,
                        "height": box["height"] + 2 * pad,
                    },
                )
                print("   ✓ MiniMap close-up")

        # ── 13. Controls close-up ──
        controls = page.locator(".react-flow__controls")
        if await controls.count() > 0:
            box = await controls.bounding_box()
            if box:
                pad = 5
                await page.screenshot(
                    path=f"{SHOTS}/13-controls.png",
                    clip={
                        "x": max(0, box["x"] - pad),
                        "y": max(0, box["y"] - pad),
                        "width": box["width"] + 2 * pad,
                        "height": box["height"] + 2 * pad,
                    },
                )
                print("   ✓ Controls panel")

        # ── 14. Edge connections visible ──
        print("11. Edge connections...")
        await fit_btn.click()
        await asyncio.sleep(1)
        # Take a wider shot focusing on the center where edges converge
        await page.screenshot(path=f"{SHOTS}/14-edges-and-connections.png")
        print("   ✓ Edge connections")

        # ── 15. Dark background detail ──
        print("12. Final overview...")
        await page.screenshot(path=f"{SHOTS}/15-final-overview.png")
        print("   ✓ Final overview")

        # Cleanup
        daemon.terminate()
        daemon.wait()
        await browser.close()

    print(f"\n✅ All screenshots saved to {SHOTS}/")
    # List all screenshots
    import os
    files = sorted(os.listdir(SHOTS))
    print(f"   {len(files)} screenshots captured:")
    for f in files:
        size = os.path.getsize(f"{SHOTS}/{f}")
        print(f"   - {f} ({size // 1024}KB)")


if __name__ == "__main__":
    asyncio.run(main())
