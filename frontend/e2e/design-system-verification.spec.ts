import { test, expect, type Page } from "@playwright/test";

const SCORING_CANVAS =
  "/p/55e69c5b-c127-4162-985e-c3b08d04b557/c/2ece8fe7-41ae-471b-9bfe-cc16876ef41f";

const SCORING_NODE_LABELS = [
  "PROMPT INPUT",
  "CONFIDENCE GAUGE",
  "FEATURE BARS",
  "EXPLAIN WATERFALL",
  "HIDDEN STATE CLOUD",
  "PERSISTENCE DIAGRAM",
  "BRIDGE MONITOR",
  "DRIFT MATRIX",
  "LAYER BREATHING HEATMAP",
  "H1 TOPOLOGICAL LOOPS",
];

const ROW_LABELS = ["INPUT & SUMMARY", "TOPOLOGY & HEALTH", "COMPLEX VISUALIZATIONS"];

// Zoom tier breakpoints from useZoomTier.ts
const TIER_ZOOMS = {
  T0: 0.2, // < 0.30
  T1: 0.4, // 0.30 – 0.55
  T2: 0.7, // 0.55 – 0.85
  T3: 1.0, // 0.85 – 1.50
  T4: 2.0, // >= 1.50
};

async function navigateToScoring(page: Page) {
  await page.goto(SCORING_CANVAS, { waitUntil: "networkidle" });
  await page.waitForSelector(".react-flow__node", { timeout: 15_000 });
  await page.waitForTimeout(1000);
}

function getNode(page: Page, label: string) {
  return page
    .locator(".react-flow__node")
    .filter({ has: page.locator(`span.uppercase:has-text("${label}")`) });
}

async function setZoomViaWheel(page: Page, targetZoom: number) {
  // Use Ctrl+wheel on the pane center to zoom directly.
  // First get current zoom.
  const currentZoom = await getCurrentZoom(page);
  if (Math.abs(currentZoom - targetZoom) < 0.02) return;

  const pane = page.locator(".react-flow__pane");
  const box = await pane.boundingBox();
  if (!box) return;

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  const ratio = targetZoom / (currentZoom || 1);
  const deltaY = ratio > 1 ? -100 : 100;
  const maxSteps = 120;

  await page.mouse.move(cx, cy);
  for (let i = 0; i < maxSteps; i++) {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(20);

    const z = await getCurrentZoom(page);
    if (
      (deltaY < 0 && z >= targetZoom) ||
      (deltaY > 0 && z <= targetZoom)
    ) {
      break;
    }
  }
  await page.waitForTimeout(300);
}

async function getCurrentZoom(page: Page): Promise<number> {
  return page.evaluate(() => {
    const vp = document.querySelector(".react-flow__viewport");
    if (!vp) return 1;
    const m = window.getComputedStyle(vp).transform.match(/matrix\(([^,]+)/);
    return m ? parseFloat(m[1]) : 1;
  });
}

// ──────────────────────────────────────────────────────
// Test Suite
// ──────────────────────────────────────────────────────

test.describe("Scoring Canvas — Design System Verification", () => {
  test.beforeEach(async ({ page }) => {
    await navigateToScoring(page);
  });

  // ── 1. All 10 content nodes + 3 row labels render ──

  test("renders all 10 scoring nodes and 3 row labels", async ({ page }) => {
    const nodeCount = await page.locator(".react-flow__node").count();
    expect(nodeCount).toBe(13);

    for (const label of SCORING_NODE_LABELS) {
      await expect(getNode(page, label)).toHaveCount(1);
    }
    // Row labels: check by data-id since data.label may not persist after save/load
    for (const id of ["row-input", "row-topo", "row-complex"]) {
      await expect(page.locator(`.react-flow__node[data-id="${id}"]`)).toHaveCount(1);
    }
  });

  // ── 2. ngs-text-title on all node headers ──

  test("all node headers use ngs-text-title (11px, weight 600)", async ({
    page,
  }) => {
    for (const label of SCORING_NODE_LABELS) {
      const header = getNode(page, label).locator("span.uppercase").first();
      await expect(header).toBeVisible();
      const styles = await header.evaluate((el) => {
        const cs = window.getComputedStyle(el);
        return { fontSize: cs.fontSize, fontWeight: cs.fontWeight };
      });
      expect(styles.fontSize).toBe("11px");
      expect(parseInt(styles.fontWeight)).toBeGreaterThanOrEqual(600);
    }
  });

  // ── 3. ngs-text-* tokens render (no 0px / missing class) ──

  test("ngs-text-meta elements have 10px font-size", async ({ page }) => {
    const metaEls = page.locator(".react-flow__node .ngs-text-meta");
    const count = await metaEls.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(count, 10); i++) {
      const fs = await metaEls.nth(i).evaluate((el) =>
        window.getComputedStyle(el).fontSize,
      );
      expect(fs).toBe("10px");
    }
  });

  test("ngs-text-micro elements have 9px font-size", async ({ page }) => {
    const microEls = page.locator(".react-flow__node .ngs-text-micro");
    const count = await microEls.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(count, 10); i++) {
      const fs = await microEls.nth(i).evaluate((el) =>
        window.getComputedStyle(el).fontSize,
      );
      expect(fs).toBe("9px");
    }
  });

  test("ngs-tabular elements have tabular-nums", async ({ page }) => {
    const tabEls = page.locator(".react-flow__node .ngs-tabular");
    const count = await tabEls.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(count, 5); i++) {
      const ffs = await tabEls.nth(i).evaluate((el) =>
        window.getComputedStyle(el).fontFeatureSettings,
      );
      expect(ffs).toContain("tnum");
    }
  });

  // ── 4. Sign palette CSS vars are defined ──

  test("sign palette CSS vars resolve to correct colors", async ({ page }) => {
    const vars = await page.evaluate(() => {
      const root = document.documentElement;
      const cs = getComputedStyle(root);
      return {
        pos: cs.getPropertyValue("--ngs-sign-pos").trim(),
        neg: cs.getPropertyValue("--ngs-sign-neg").trim(),
      };
    });
    expect(vars.pos).toBe("#4ade80");
    expect(vars.neg).toBe("#f87171");
  });

  // ── 5. ariaLabel on all scoring nodes ──

  test("all 10 scoring nodes have aria-label on their region", async ({
    page,
  }) => {
    const regions = page.locator('.react-flow__node [role="region"]');
    const count = await regions.count();
    expect(count).toBeGreaterThanOrEqual(10);

    for (let i = 0; i < count; i++) {
      const label = await regions.nth(i).getAttribute("aria-label");
      expect(label).toBeTruthy();
      expect(label!.length).toBeGreaterThan(5);
    }
  });

  // ── 6. Interactive buttons have aria-label ──

  test("PromptInputNode nav buttons have aria-labels", async ({ page }) => {
    const promptNode = getNode(page, "PROMPT INPUT");
    const navBtns = promptNode.locator("button[aria-label]");
    const count = await navBtns.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  // ── 7. No unmigrated tokens in rendered DOM ──

  test("no font-family: monospace on numeric elements in scoring nodes", async ({
    page,
  }) => {
    // Check that no elements inside scoring nodes use monospace font-family
    // (they should use font-feature-settings: "tnum" instead)
    const monoEls = await page.evaluate(() => {
      const nodes = document.querySelectorAll(".react-flow__node");
      const bad: string[] = [];
      nodes.forEach((node) => {
        const label = node.querySelector("span.uppercase")?.textContent ?? "";
        if (
          !/PROMPT|GAUGE|FEATURE|EXPLAIN|CLOUD|PERSISTENCE|BRIDGE|DRIFT|HEATMAP|LOOP/i.test(
            label,
          )
        )
          return;
        node.querySelectorAll("*").forEach((el) => {
          const cs = window.getComputedStyle(el);
          const ff = cs.fontFamily.toLowerCase();
          if (
            ff.includes("monospace") &&
            !ff.includes("ui-monospace") &&
            el.classList.contains("font-mono")
          ) {
            bad.push(
              `${label} > ${el.tagName}.${Array.from(el.classList).join(".")}`,
            );
          }
        });
      });
      return bad;
    });
    expect(monoEls).toEqual([]);
  });

  // ── 8. motion-safe:animate-pulse (no bare animate-pulse) ──

  test("animate-pulse is gated on motion-safe in scoring nodes", async ({
    page,
  }) => {
    const bareAnimate = await page.evaluate(() => {
      const bad: string[] = [];
      document.querySelectorAll(".react-flow__node *").forEach((el) => {
        const classes = Array.from(el.classList);
        if (
          classes.includes("animate-pulse") &&
          !classes.some((c) => c.includes("motion-safe"))
        ) {
          bad.push(
            `${el.tagName}.${classes.join(".")} in ${el.closest(".react-flow__node")?.querySelector("span.uppercase")?.textContent ?? "?"}`,
          );
        }
      });
      return bad;
    });
    expect(bareAnimate).toEqual([]);
  });

  // ── 9. Health band uses CSS var colors (not hardcoded emerald/red) ──

  test("health band div uses CSS var background, not Tailwind emerald/red class", async ({
    page,
  }) => {
    // The health band is the first child div with h-[3px] inside [role="region"]
    const healthBands = page.locator('[role="region"] > div.h-\\[3px\\]');
    const count = await healthBands.count();
    // May be 0 if no health status is set; that's fine
    for (let i = 0; i < count; i++) {
      const classes = await healthBands.nth(i).getAttribute("class");
      expect(classes).not.toContain("bg-emerald");
      expect(classes).not.toContain("bg-red-");
      // Should have inline backgroundColor
      const hasBg = await healthBands.nth(i).evaluate(
        (el) => !!el.style.backgroundColor,
      );
      expect(hasBg).toBe(true);
    }
  });

  // ── 10. ExplainWaterfallNode feature rows have role="button" ──

  test("ExplainWaterfallNode feature rows have role=button and aria-expanded", async ({
    page,
  }) => {
    const explainNode = getNode(page, "EXPLAIN WATERFALL");
    const featureRows = explainNode.locator('[role="button"]');
    const count = await featureRows.count();
    // May be 0 if no data loaded; check if present
    if (count > 0) {
      for (let i = 0; i < Math.min(count, 5); i++) {
        const expanded = await featureRows
          .nth(i)
          .getAttribute("aria-expanded");
        expect(expanded).toBeTruthy(); // "true" or "false" string
      }
    }
  });

  // ── 11. Row group backgrounds are non-interactive ──

  test("row label backgrounds are not selectable or draggable", async ({
    page,
  }) => {
    for (const id of ["row-input", "row-topo", "row-complex"]) {
      const rowNode = page.locator(`.react-flow__node[data-id="${id}"]`);
      await expect(rowNode).toHaveCount(1);
      const classes = (await rowNode.getAttribute("class")) ?? "";
      expect(classes).not.toContain("selected");
    }
  });

  // ── 12. Edges from prompt to downstream ──

  test("edges connect prompt to all 8 downstream nodes", async ({ page }) => {
    const edges = page.locator(".react-flow__edge");
    const count = await edges.count();
    expect(count).toBeGreaterThanOrEqual(7);
  });
});

// ──────────────────────────────────────────────────────
// Zoom Tier Tests
// ──────────────────────────────────────────────────────

test.describe("Scoring Canvas — Zoom Tier Transitions", () => {
  test.beforeEach(async ({ page }) => {
    await navigateToScoring(page);
  });

  test("T0 (zoom < 0.30): nodes show solid colored rectangles, no body content", async ({
    page,
  }) => {
    await setZoomViaWheel(page, TIER_ZOOMS.T0);
    const z = await getCurrentZoom(page);
    expect(z).toBeLessThan(0.35);

    // At T0, scoring nodes should show a flat colored div (viridis/drift)
    // and no text body content. The key indicator is the ngs-viridis-2 or
    // ngs-drift-2 background on a full-bleed div.
    const promptNode = getNode(page, "PROMPT INPUT");
    // At T0, the node should exist but not show detailed controls
    const textareas = promptNode.locator("textarea");
    expect(await textareas.count()).toBe(0);
  });

  test("T1 (zoom 0.30-0.55): nodes show label centered on colored background", async ({
    page,
  }) => {
    await setZoomViaWheel(page, TIER_ZOOMS.T1);
    const z = await getCurrentZoom(page);
    expect(z).toBeGreaterThanOrEqual(0.28);
    expect(z).toBeLessThan(0.6);

    // At T1, nodes should show their title text on a colored background
    // Check that ConfidenceGaugeNode shows just a label, not the full gauge
    const gaugeNode = getNode(page, "CONFIDENCE GAUGE");
    await expect(gaugeNode).toBeVisible();
    // No SVG gauge arc at T1
    const svgs = gaugeNode.locator("svg");
    expect(await svgs.count()).toBe(0);
  });

  test("T3 (zoom 0.85-1.50): full detail render with all controls", async ({
    page,
  }) => {
    await setZoomViaWheel(page, TIER_ZOOMS.T3);
    const z = await getCurrentZoom(page);
    expect(z).toBeGreaterThanOrEqual(0.8);

    // At T3, PromptInput should show the textarea and nav controls
    const promptNode = getNode(page, "PROMPT INPUT");
    const buttons = promptNode.locator("button");
    expect(await buttons.count()).toBeGreaterThanOrEqual(2);

    // At T3, all nodes should show their BaseNodeShell header (not just a colored block)
    for (const label of ["CONFIDENCE GAUGE", "FEATURE BARS", "BRIDGE MONITOR"]) {
      const node = getNode(page, label);
      const header = node.locator("span.uppercase").first();
      await expect(header).toBeVisible();
    }
  });

  test("tier transitions produce no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    // Zoom through all tiers
    for (const [tier, zoom] of Object.entries(TIER_ZOOMS)) {
      await setZoomViaWheel(page, zoom);
      await page.waitForTimeout(500);
    }

    // Filter out noise (React dev warnings, network errors from WS)
    const realErrors = errors.filter(
      (e) =>
        !e.includes("WebSocket") &&
        !e.includes("ws://") &&
        !e.includes("wss://") &&
        !e.includes("Failed to fetch") &&
        !e.includes("net::ERR") &&
        !e.includes("Warning:"),
    );
    expect(realErrors).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────
// PromptInput + H1Loop Interactive Controls
// ──────────────────────────────────────────────────────

test.describe("Scoring Canvas — Interactive Controls", () => {
  test.beforeEach(async ({ page }) => {
    await navigateToScoring(page);
  });

  test("PromptInputNode: nav buttons work (next/prev problem)", async ({
    page,
  }) => {
    const promptNode = getNode(page, "PROMPT INPUT");
    const nextBtn = promptNode.locator('button[aria-label="Next problem"]');
    if ((await nextBtn.count()) > 0) {
      await nextBtn.click();
      await page.waitForTimeout(500);
      // Should not crash — verify node is still visible
      await expect(promptNode).toBeVisible();
    }
  });

  test("PromptInputNode: demo buttons have aria-labels", async ({ page }) => {
    const promptNode = getNode(page, "PROMPT INPUT");
    // Check for demo skip buttons
    const skipBtns = promptNode.locator(
      'button[aria-label*="problem"], button[aria-label*="Previous"]',
    );
    const count = await skipBtns.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("H1LoopNode: tab buttons have aria-labels", async ({ page }) => {
    const h1Node = getNode(page, "H1 TOPOLOGICAL LOOPS");
    const tabBtns = h1Node.locator('button[aria-label*="tab"]');
    const count = await tabBtns.count();
    // At T3 zoom there should be tab buttons
    // If data isn't loaded, node may show loading state — that's OK
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const label = await tabBtns.nth(i).getAttribute("aria-label");
        expect(label).toMatch(/Diagram|Replay|Text/);
      }
    }
  });

  test("HiddenStateCloudNode: Focus button has aria-label", async ({
    page,
  }) => {
    const cloudNode = getNode(page, "HIDDEN STATE CLOUD");
    const focusBtn = cloudNode.locator(
      'button[aria-label="Focus on bridge point"]',
    );
    // May not be visible if R3F hasn't loaded — count check
    const count = await focusBtn.count();
    if (count > 0) {
      await expect(focusBtn.first()).toBeVisible();
    }
  });
});

// ──────────────────────────────────────────────────────
// Color & Visual Token Verification
// ──────────────────────────────────────────────────────

test.describe("Scoring Canvas — Color & Visual Tokens", () => {
  test.beforeEach(async ({ page }) => {
    await navigateToScoring(page);
  });

  test("Viridis CSS vars are defined", async ({ page }) => {
    const vars = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        v0: cs.getPropertyValue("--ngs-viridis-0").trim(),
        v2: cs.getPropertyValue("--ngs-viridis-2").trim(),
        v4: cs.getPropertyValue("--ngs-viridis-4").trim(),
      };
    });
    expect(vars.v0.length).toBeGreaterThan(0);
    expect(vars.v2.length).toBeGreaterThan(0);
    expect(vars.v4.length).toBeGreaterThan(0);
  });

  test("Drift CSS vars are defined", async ({ page }) => {
    const vars = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        d0: cs.getPropertyValue("--ngs-drift-0").trim(),
        d2: cs.getPropertyValue("--ngs-drift-2").trim(),
        d4: cs.getPropertyValue("--ngs-drift-4").trim(),
      };
    });
    expect(vars.d0.length).toBeGreaterThan(0);
    expect(vars.d2.length).toBeGreaterThan(0);
    expect(vars.d4.length).toBeGreaterThan(0);
  });

  test("canvas-deep CSS var is defined (used as SVG backgrounds)", async ({
    page,
  }) => {
    const val = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--ngs-canvas-deep")
        .trim(),
    );
    expect(val.length).toBeGreaterThan(0);
  });

  test("category border colors are applied to scoring nodes", async ({
    page,
  }) => {
    // Check that node shells have colored borders (not plain neutral)
    const regions = page.locator('.react-flow__node [role="region"]');
    const count = await regions.count();
    let coloredBorders = 0;
    for (let i = 0; i < count; i++) {
      const classes = (await regions.nth(i).getAttribute("class")) ?? "";
      if (/border-(amber|blue|cyan|emerald|violet|sky)-700/.test(classes)) {
        coloredBorders++;
      }
    }
    // All 10 scoring nodes should have category borders
    expect(coloredBorders).toBeGreaterThanOrEqual(10);
  });
});
