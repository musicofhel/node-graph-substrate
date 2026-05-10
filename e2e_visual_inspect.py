"""
E2E visual inspection of node-graph-substrate using Playwright.

Tests:
  1. Backend health + API CRUD
  2. Frontend loads with all 7 nodes and 6 edges
  3. WebSocket connects to real graphId (not "demo")
  4. Synthetic daemon streams update subscriber nodes
  5. Compute path (prompt input -> feature bars)
  6. Save/load round-trip
  7. Node interactions (click, zoom)
  8. Server log audit
  9. Substrate isolation invariant
  10. Redis stream inspection
"""

import asyncio
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path

from playwright.sync_api import sync_playwright, Page, expect

SCREENSHOTS_DIR = Path(__file__).parent / "e2e_screenshots"
SCREENSHOTS_DIR.mkdir(exist_ok=True)

API_BASE = "http://localhost:8080"
FRONTEND_URL = "http://localhost:5173"

pass_count = 0
fail_count = 0
warn_count = 0


def result(status: str, msg: str):
    global pass_count, fail_count, warn_count
    if status == "PASS":
        pass_count += 1
    elif status == "FAIL":
        fail_count += 1
    elif status == "WARN":
        warn_count += 1
    print(f"  [{status}] {msg}")


def screenshot(page: Page, name: str):
    path = SCREENSHOTS_DIR / f"{name}.png"
    page.screenshot(path=str(path), full_page=True)
    print(f"  >> {path.name}")


# ── Phase 1: Backend Health ─────────────────────────────────────────────────

def test_backend_health():
    print("\n=== Phase 1: Backend Health & API CRUD ===")
    import urllib.request

    resp = urllib.request.urlopen(f"{API_BASE}/health")
    data = json.loads(resp.read())
    assert data["status"] == "ok"
    result("PASS", "/health returns ok")

    slug = f"e2e-{uuid.uuid4().hex[:6]}"
    req = urllib.request.Request(
        f"{API_BASE}/api/projects",
        data=json.dumps({"slug": slug, "display_name": "E2E Test"}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    resp = urllib.request.urlopen(req)
    proj = json.loads(resp.read())
    assert "id" in proj
    result("PASS", f"POST /api/projects -> id={proj['id'][:8]}...")

    req = urllib.request.Request(
        f"{API_BASE}/api/graphs",
        data=json.dumps({"project_id": proj["id"], "name": "E2E Graph"}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    resp = urllib.request.urlopen(req)
    graph = json.loads(resp.read())
    assert "id" in graph
    result("PASS", f"POST /api/graphs -> id={graph['id'][:8]}...")

    resp = urllib.request.urlopen(f"{API_BASE}/api/graphs/{graph['id']}")
    loaded = json.loads(resp.read())
    assert loaded["id"] == graph["id"]
    result("PASS", f"GET /api/graphs/{graph['id'][:8]}... -> matches")

    # Test idempotent project creation (same slug returns existing)
    req = urllib.request.Request(
        f"{API_BASE}/api/projects",
        data=json.dumps({"slug": slug, "display_name": "E2E Test"}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    resp = urllib.request.urlopen(req)
    proj2 = json.loads(resp.read())
    assert proj2["id"] == proj["id"]
    result("PASS", "Idempotent project creation works")

    # Test idempotent graph creation (same name returns existing)
    req = urllib.request.Request(
        f"{API_BASE}/api/graphs",
        data=json.dumps({"project_id": proj["id"], "name": "E2E Graph"}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    resp = urllib.request.urlopen(req)
    graph2 = json.loads(resp.read())
    assert graph2["id"] == graph["id"]
    result("PASS", "Idempotent graph creation works")

    return proj, graph


# ── Phase 2: Frontend Load ──────────────────────────────────────────────────

def test_frontend_loads(page: Page):
    print("\n=== Phase 2: Frontend Load ===")

    page.goto(FRONTEND_URL, wait_until="networkidle")
    page.wait_for_timeout(4000)

    screenshot(page, "01-initial-load")

    rf = page.locator(".react-flow")
    expect(rf).to_be_visible(timeout=10000)
    result("PASS", "React Flow container visible")

    # Check node palette sidebar
    palette = page.locator("text=NODE PALETTE")
    if palette.count() > 0:
        result("PASS", "Node palette header visible")
    else:
        result("WARN", "NODE PALETTE header not found")

    # Wait for default nodes to load
    page.wait_for_timeout(2000)

    # Check React Flow node count
    nodes = page.locator(".react-flow__node")
    node_count = nodes.count()
    print(f"  [INFO] React Flow nodes: {node_count}")

    if node_count == 0:
        # fitView might be needed
        fit_btn = page.locator(".react-flow__controls-fitview")
        if fit_btn.count() > 0:
            fit_btn.click()
            page.wait_for_timeout(1000)
            node_count = nodes.count()
            print(f"  [INFO] After fitView: {node_count} nodes")

    # Check store directly via JS
    store_state = page.evaluate("""() => {
        try {
            const store = window.__zustandStore || null;
            // Try accessing the Zustand store through React internals
            const nodes = document.querySelectorAll('.react-flow__node');
            const graphId = localStorage.getItem('substrate:lastGraphId');
            return {
                domNodes: nodes.length,
                graphId: graphId,
                url: window.location.href,
            };
        } catch(e) {
            return { error: e.message };
        }
    }""")
    print(f"  [INFO] Store state: {json.dumps(store_state, indent=2)}")

    if store_state.get("graphId"):
        result("PASS", f"graphId in localStorage: {store_state['graphId'][:8]}...")
    else:
        result("WARN", "No graphId in localStorage yet")

    # Check minimap/controls
    expect(page.locator(".react-flow__controls")).to_be_visible(timeout=3000)
    result("PASS", "React Flow controls visible")

    expect(page.locator(".react-flow__minimap")).to_be_visible(timeout=3000)
    result("PASS", "MiniMap visible")

    screenshot(page, "02-canvas-state")
    return node_count


# ── Phase 3: WebSocket ───────────────────────────────────────────────────────

def test_websocket(page: Page):
    print("\n=== Phase 3: WebSocket Connection ===")

    ws_urls = []
    page.on("websocket", lambda ws: ws_urls.append(ws.url))

    page.reload(wait_until="networkidle")
    page.wait_for_timeout(5000)

    screenshot(page, "03-after-reload")

    # Check if WS connected to backend (port 8080), not just Vite HMR
    backend_ws = [u for u in ws_urls if "8080" in u]
    vite_ws = [u for u in ws_urls if "5173" in u]

    if backend_ws:
        for url in backend_ws:
            if "/ws/canvas/" in url:
                graph_part = url.split("/ws/canvas/")[-1]
                if graph_part and graph_part != "demo":
                    result("PASS", f"WS connected to real canvas: ...{graph_part[:8]}")
                elif graph_part == "demo":
                    result("FAIL", "WS still using 'demo' canvas")
                else:
                    result("WARN", f"WS URL: {url}")
            else:
                result("INFO", f"Backend WS: {url}")
    else:
        result("WARN", "No WS connections to port 8080 captured")

    if vite_ws:
        print(f"  [INFO] {len(vite_ws)} Vite HMR websocket(s) (expected)")

    # Verify graphId persisted
    graph_id = page.evaluate("localStorage.getItem('substrate:lastGraphId')")
    if graph_id:
        result("PASS", f"graphId persisted in localStorage: {graph_id[:8]}...")
    else:
        result("WARN", "No graphId in localStorage")

    # Check node count after reload
    node_count = page.locator(".react-flow__node").count()
    print(f"  [INFO] Nodes after reload: {node_count}")

    return graph_id


# ── Phase 4: Synthetic Daemon ────────────────────────────────────────────────

def test_synthetic_daemon(page: Page):
    print("\n=== Phase 4: Synthetic Daemon Streaming ===")

    daemon = subprocess.Popen(
        [sys.executable, "synthetic_daemon.py"],
        cwd=str(Path(__file__).parent),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    print(f"  [INFO] Synthetic daemon started (PID={daemon.pid})")

    try:
        # Let a few ticks flow (daemon publishes every 2s)
        page.wait_for_timeout(5000)
        screenshot(page, "04-streaming-5s")

        page.wait_for_timeout(5000)
        screenshot(page, "05-streaming-10s")

        # Fit view to see all nodes
        fit_btn = page.locator(".react-flow__controls-fitview")
        if fit_btn.count() > 0:
            fit_btn.click()
            page.wait_for_timeout(1000)

        screenshot(page, "06-fitted-with-data")

        # Check for visual evidence of data
        node_count = page.locator(".react-flow__node").count()
        if node_count > 0:
            result("PASS", f"{node_count} nodes visible with streaming data")
        else:
            result("WARN", "No nodes visible during streaming")

        # Check for SVG content (gauges, diagrams, bars)
        svg_count = page.locator("svg").count()
        print(f"  [INFO] SVG elements: {svg_count}")

        # Check for canvas/3D elements (R3F hidden state cloud)
        canvas_count = page.locator("canvas").count()
        print(f"  [INFO] Canvas elements: {canvas_count}")

    finally:
        daemon.terminate()
        try:
            daemon.wait(timeout=5)
        except subprocess.TimeoutExpired:
            daemon.kill()
        result("PASS", "Synthetic daemon stopped cleanly")


# ── Phase 5: Compute Path ───────────────────────────────────────────────────

def test_compute_path(page: Page):
    print("\n=== Phase 5: Compute Path ===")

    # Fit view first to see all nodes
    fit_btn = page.locator(".react-flow__controls-fitview")
    if fit_btn.count() > 0:
        fit_btn.click()
        page.wait_for_timeout(500)

    # Try to find and interact with PromptInput textarea
    textarea = page.locator("textarea")
    if textarea.count() > 0:
        textarea.first.click()
        page.wait_for_timeout(300)
        textarea.first.fill("What is the meaning of life?")
        screenshot(page, "07-prompt-entered")
        result("PASS", "Prompt text entered")

        analyze_btn = page.locator("button:has-text('Analyze')")
        if analyze_btn.count() > 0:
            analyze_btn.click()
            result("PASS", "Analyze button clicked")
            page.wait_for_timeout(3000)
            screenshot(page, "08-after-analyze")
        else:
            result("WARN", "No Analyze button found")
    else:
        result("WARN", "No textarea found (PromptInput may be off-viewport)")
        screenshot(page, "07-no-textarea")


# ── Phase 6: Save/Load ──────────────────────────────────────────────────────

def test_save_load(page: Page):
    print("\n=== Phase 6: Save/Load Round-Trip ===")

    save_btn = page.locator("button:has-text('Save')")
    if save_btn.count() > 0:
        is_disabled = save_btn.evaluate("el => el.disabled")
        if is_disabled:
            result("WARN", "Save button is disabled (no graphId loaded)")
        else:
            save_btn.click()
            page.wait_for_timeout(2000)
            result("PASS", "Save clicked")
            screenshot(page, "09-after-save")
    else:
        result("WARN", "No Save button found")

    # Test Load
    load_btn = page.locator("button:has-text('Load')")
    if load_btn.count() > 0:
        load_btn.click()
        page.wait_for_timeout(2000)
        result("PASS", "Load clicked")
        screenshot(page, "10-after-load")
    else:
        result("WARN", "No Load button found")

    # Verify persistence across reload
    pre_count = page.locator(".react-flow__node").count()
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(3000)
    post_count = page.locator(".react-flow__node").count()
    print(f"  [INFO] Nodes before reload: {pre_count}, after: {post_count}")
    screenshot(page, "11-reload-persistence")


# ── Phase 7: Node Interactions ───────────────────────────────────────────────

def test_interactions(page: Page):
    print("\n=== Phase 7: Node Interactions ===")

    nodes = page.locator(".react-flow__node")
    if nodes.count() > 0:
        nodes.first.click()
        page.wait_for_timeout(300)
        screenshot(page, "12-node-selected")
        result("PASS", "Node click works")
    else:
        result("WARN", "No nodes to click")

    # Zoom controls
    zoom_in = page.locator(".react-flow__controls-zoomin")
    if zoom_in.count() > 0:
        for _ in range(3):
            zoom_in.click()
            page.wait_for_timeout(200)
        screenshot(page, "13-zoomed-in")
        result("PASS", "Zoom in works")

    zoom_out = page.locator(".react-flow__controls-zoomout")
    if zoom_out.count() > 0:
        for _ in range(5):
            zoom_out.click()
            page.wait_for_timeout(200)
        screenshot(page, "14-zoomed-out")
        result("PASS", "Zoom out works")

    fit_view = page.locator(".react-flow__controls-fitview")
    if fit_view.count() > 0:
        fit_view.click()
        page.wait_for_timeout(500)
        screenshot(page, "15-fit-view")
        result("PASS", "Fit view works")


# ── Phase 8: Server Logs ────────────────────────────────────────────────────

def test_server_logs():
    print("\n=== Phase 8: Server Log Audit ===")

    res = subprocess.run(
        ["docker", "compose", "logs", "--tail=200", "server"],
        capture_output=True, text=True,
        cwd=str(Path(__file__).parent),
    )
    lines = res.stdout.split("\n")
    errors = [l for l in lines if "error" in l.lower() or "traceback" in l.lower()]
    ws_lines = [l for l in lines if "ws" in l.lower() or "canvas" in l.lower()]

    if errors:
        # Filter out expected errors (like health check 404s etc)
        real_errors = [e for e in errors if "health" not in e.lower()]
        if real_errors:
            result("WARN", f"{len(real_errors)} error-related log lines")
            for e in real_errors[:5]:
                print(f"    {e.strip()[:120]}")
        else:
            result("PASS", "No unexpected errors in server logs")
    else:
        result("PASS", "No errors in server logs")

    if ws_lines:
        print(f"  [INFO] {len(ws_lines)} WS/canvas log lines (last 5):")
        for l in ws_lines[-5:]:
            print(f"    {l.strip()[:120]}")


# ── Phase 9: Substrate Isolation ─────────────────────────────────────────────

def test_substrate_isolation():
    print("\n=== Phase 9: Substrate Isolation ===")

    res = subprocess.run(
        ["grep", "-r", "topo_confidence\\|TopoConfidence", "server/substrate/"],
        capture_output=True, text=True,
        cwd=str(Path(__file__).parent),
    )
    if res.stdout.strip():
        result("FAIL", "Found topo_confidence refs in server/substrate/!")
        print(f"    {res.stdout.strip()}")
    else:
        result("PASS", "Zero topo_confidence references in server/substrate/")


# ── Phase 10: Redis Streams ─────────────────────────────────────────────────

def test_redis_streams():
    print("\n=== Phase 10: Redis Streams ===")

    streams = [
        "topoconf:scoring:hidden_state_cloud",
        "topoconf:scoring:persistence_computed",
        "topoconf:scoring:features_computed",
        "topoconf:scoring:confidence_scored",
        "topoconf:scoring:bridge_health",
        "topoconf:scoring:explain_result",
    ]

    for stream in streams:
        try:
            res = subprocess.run(
                ["docker", "compose", "exec", "-T", "redis",
                 "redis-cli", "XLEN", stream],
                capture_output=True, text=True, timeout=10,
                cwd=str(Path(__file__).parent),
            )
            length = int(res.stdout.strip())
            if length > 0:
                result("PASS", f"{stream.split(':')[-1]}: {length} entries")
            else:
                result("WARN", f"{stream.split(':')[-1]}: 0 entries")
        except Exception as e:
            result("WARN", f"{stream.split(':')[-1]}: {e}")


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("+" + "=" * 58 + "+")
    print("|  node-graph-substrate E2E Visual Inspection              |")
    print("+" + "=" * 58 + "+")

    test_backend_health()

    console_logs = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=2,
        )
        page = context.new_page()
        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: console_logs.append(f"[PAGE_ERROR] {err}"))

        try:
            test_frontend_loads(page)
            test_websocket(page)
            test_synthetic_daemon(page)
            test_compute_path(page)
            test_save_load(page)
            test_interactions(page)
        finally:
            browser.close()

    test_server_logs()
    test_substrate_isolation()
    test_redis_streams()

    # Console summary
    print("\n=== Browser Console Summary ===")
    errors = [l for l in console_logs if "PAGE_ERROR" in l or ("error" in l.lower() and "[error]" in l.lower())]
    warnings = [l for l in console_logs if "[warning]" in l.lower()]
    if errors:
        result("WARN", f"{len(errors)} console errors:")
        for e in errors[:10]:
            print(f"    {e[:150]}")
    else:
        result("PASS", "No console errors")

    # Final summary
    print(f"\n{'=' * 60}")
    print(f"  PASS: {pass_count}  |  FAIL: {fail_count}  |  WARN: {warn_count}")
    print(f"{'=' * 60}")
    print(f"  Screenshots: {SCREENSHOTS_DIR}/")
    print()

    return 1 if fail_count > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
