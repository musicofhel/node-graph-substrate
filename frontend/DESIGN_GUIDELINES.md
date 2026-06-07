# DESIGN_GUIDELINES.md — Scoring Canvas Node Standards

**Repository:** `musicofhel/node-graph-substrate`
**Scope:** the `scoring` canvas kind in the `topo-confidence` pack (`frontend/src/packs/topo-confidence/manifest.ts`), plus the shared substrate primitives that govern it.
**Audience:** Aaron Cohen and future contributors implementing nodes against the pack contract defined in SPEC-v5 §8.
**Status:** v1 draft. Treat as additive to SPEC-v5, not a replacement for it.

## 1. Context

The scoring canvas is composed by `CanvasPage.tsx` (lines 252–295). It places ten content nodes plus three `row_label` background nodes on a 1320 × 1140 logical-pixel grid. Rows are 360 / 340 / 440 pixels tall and contain "Input & Summary," "Topology & Health," and "Complex Visualizations" respectively. All node positions are explicit; there is no force-directed or ELK auto-layout on this canvas (ELK exists in `lib/layout/` but is not invoked here). The React Flow viewport supports pan, zoom, and a mini-map; the canvas mounts with `fitView` and `fitViewOptions={{ padding: 0.05, maxZoom: 1 }}` (`SubstrateCanvas.tsx:107`).

Every content node renders through `BaseNodeShell` (`components/nodes/BaseNodeShell.tsx`). The shell already provides four mechanisms the guidelines below build on: a per-category border color (`CATEGORY_BORDER` map at line 30), a drift health band (`HEALTH_BAND` map at line 41), input and output handles colored by port type via `HANDLE_COLORS`, and a `NodeResizer` constrained to `minWidth={200}`, `minHeight={100}`. The shell is the lever; this document defines what travels through it.

## 2. Sources Consulted and Why

Three families of sources informed the rules below.

**Repository inspection** carried the heaviest weight. The conventions in `BaseNodeShell`, the existing `CATEGORY_BORDER` palette, the `HANDLE_COLORS` port-type system, the row-grouping pattern in `RowLabelNode`, the `Sparkline` component, the `LodLabel` Three.js tier abstraction, and the pack contract in SPEC-v5 §8 are all already-present primitives that any guideline must respect rather than redesign. Where the rules below diverge from current code, the divergence is called out explicitly.

**Mechanistic interpretability visualization prior art** supplied defensible defaults for the few questions the repo does not already answer. The Anthropic "Circuit Tracing" methods paper (transformer-circuits.pub, March 2025) and the `anthropics/attribution-graphs-frontend` reference implementation establish the green-positive / red-or-purple-negative sign convention for attribution and contribution displays — the same convention `ExplainWaterfallNode` already follows with `#4ade80` / `#f87171`. Neuronpedia and TransformerLens documentation cross-corroborate per-layer / per-token display patterns relevant to `BreathingHeatmapNode` and `H1LoopNode`.

**Visualization theory and accessibility standards** supplied the type scale, color-encoding choices, and contrast minimums. Munzner's *Visualization Analysis and Design* (CRC Press, 2014) provides the channel-effectiveness ranking that argues against using color hue to encode probability when luminance is free. Shneiderman's "Overview first, zoom and filter, then details on demand" (IEEE Visual Languages, 1996) is the spine of the semantic-zoom specification in §6. WCAG 2.1 §1.4.3 and §1.4.11 supply the 4.5:1 contrast minimum for body text and the 3:1 minimum for non-text UI and graphical objects required to understand the content. The Okabe-Ito 2008 palette and the Viridis / Cividis / Magma families supply colorblind-safe defaults for categorical and sequential data respectively. The tldraw Performance documentation supplied the concrete LOD threshold reference (`textShadowLod` defaults to 0.35) and the VisualFlow writeup on architecting React Flow at scale supplied the "swap complex components for plain `<div>` placeholders below 0.5 zoom" pattern that the §6 specification adapts.

## 3. Current-State Observations

These observations are grounded in the files inspected at commit `9c70798`. Each is actionable and tied to a specific file or pattern.

### 3.1 Type scale is undefined

Sizes inside nodes span ten distinct values without a documented scale: `text-[8px]`, `text-[9px]`, `text-[10px]`, `text-[11px]`, `text-xs` (12 px), `text-sm` (14 px), and inline SVG `fontSize` values of 6, 7, 8, 9, 10, and 20. The 6-px label inside `BreathingHeatmapNode.tsx` (sparkline annotations) and the 7-px footer markers in the same file are below any defensible legibility floor at zoom = 1.0; they exist because the breathing-heatmap layout is dense, but the layout itself is the lever that should change, not the font size.

### 3.2 Color is overloaded across nodes that all encode "good versus bad"

`BaseNodeShell` already supplies a canonical category palette (`input` amber, `extraction` blue, `topology` cyan, `scoring` emerald, `experiment` violet, `navigation` sky) consumed by all ten scoring-canvas nodes. The category system is sound and should be preserved. Inside the node bodies, however, the encoding fragments:

- `ConfidenceGaugeNode` uses emerald >= 0.7, amber >= 0.4, red otherwise.
- `BreathingHeatmapNode` uses a custom dark-blue -> teal -> green -> yellow ramp with hand-tuned RGB stops.
- `FeatureBarsNode` uses one fixed hue per feature with no shared meaning (H0 blue, H1 cyan, H2 violet, bridge gold, significance green, sensitivity red).
- `ExplainWaterfallNode` uses green-for-positive-contribution and red-for-negative — the closest the repo has to a sign convention.
- `DriftMatrixNode` uses ok / warning / alert (green / amber / red).
- `H1LoopNode` uses the `turbo` colormap for cycle indices.
- The mini-map in `SubstrateCanvas.tsx:124` hardcodes `nodeColor="#10b981"` regardless of category or drift status.

The result is that a viewer scanning the canvas sees several different "red"s with several different meanings, and "green" is used both for correctness, for low PSI drift, and for positive contribution.

### 3.3 No semantic zoom on the React Flow canvas

The only level-of-detail logic in the repository is `lib/three/LodLabel.tsx`, which is gated on Three.js camera distance and used only inside `HiddenStateCloudNode` for the bridge label. The React Flow canvas itself does not consult `useViewport().zoom` from `@xyflow/react`, and node interiors do not adapt to zoom. At zoom = 0.25, a 10-px label inside `FeatureBarsNode` renders at roughly 2.5 device pixels and is unreadable. At zoom = 2.0, the same label renders at 20 device pixels and the node becomes a wasted block of whitespace around small text. Both endpoints are improvable.

### 3.4 NodeResizer minimums are too generous for complex nodes

`BaseNodeShell` declares `minWidth={200}, minHeight={100}` on the resizer. `DriftMatrixNode` requires roughly 80 (label) + 13 features x 22 px = 366 px of horizontal SVG room to be legible. `BreathingHeatmapNode` requires `SVG_W = SPARK_X + SPARK_W + 20` ~ 500 px. `H1LoopNode`'s internal layout assumes `minWidth: compareLayer ? 640 : 400, minHeight: 280`. A user dragging these nodes below their internal-SVG minimums produces clipping or overflow, not graceful degradation. The fix is per-node `minWidth` and `minHeight` overrides on the resizer.

### 3.5 Feature lists are duplicated across files

The 13 topological features (`H0_persistence_entropy`, `H1_max_lifetime`, etc.) appear independently in `FeatureBarsNode.tsx:10–24`, `DriftMatrixNode.tsx:8–14`, and `ExplainWaterfallNode.tsx`'s `FEATURE_INFO` map. Adding a 14th feature requires editing three files plus the manifest, and silent drift between the lists is possible. This belongs in a single module — `packs/topo-confidence/features.ts` — imported everywhere.

### 3.6 Numeric rendering is inconsistent

Some scores use `font-mono` (`FeatureBarsNode`, `BridgeMonitorNode` table), some use the inline `fontFamily="monospace"` SVG attribute (`ConfidenceGaugeNode`), and `PromptInputNode` uses `tabular-nums` (a font-feature-settings instruction). The three approaches render differently and complicate scanning a column of numbers across nodes. One convention should win.

### 3.7 Drift health bands and alert pulse violate reduced-motion preferences

`BaseNodeShell` applies `animate-pulse` to the red health band when `healthStatus === "alert"`. Users with `prefers-reduced-motion: reduce` set in their OS should not see continuously-animated UI; the WCAG 2.1 §2.3.3 guidance is to honor that preference. The fix is a single CSS media query.

### 3.8 The mini-map is uninformative

`MiniMap` is currently a uniform emerald grid (`nodeColor="#10b981"`), which gives no spatial cue about node category or drift status. The mini-map is the user's overview channel; it should encode at least one signal.

### 3.9 Edge styling is uniform across semantically different connections

All edges in the scoring canvas originate from `prompt_input.features_out` and fan out to all eight downstream nodes (`CanvasPage.tsx:279–287`). They are styled identically via `defaultEdgeOptions` with `strokeWidth: 2, stroke: "var(--ngs-edge-stroke)"`. The data shape on the wire is the same (`type: "features"`), so uniform styling is defensible — but there is no affordance for distinguishing "edge is currently transmitting" from "edge is idle" except the existing `StaleEdge` custom edge, which is registered but not applied by default.

### 3.10 No keyboard navigation between nodes

The only keyboard handling in `SubstrateCanvas.tsx` is `Escape` to clear selection (lines 36–43) and `deleteKeyCode={["Backspace", "Delete"]}`. There is no Tab traversal across nodes, no Enter to open the detail panel, no arrow-key navigation. For a research tool used daily, this is a productivity cost.

## 4. Design Principles

Six principles. Each is sourced and each is the rationale for a specific rule in §5–§10.

**P1 — Munzner channel effectiveness.** For ordered data, the perceptual ranking is position > length > angle > area > luminance ~ saturation > color hue > shape. Probability and confidence scores are ordered; they should be encoded on luminance (a sequential ramp) before hue. The category palette on `BaseNodeShell` already uses hue for *categorical* identity, which is the correct channel for that data type.

**P2 — Shneiderman's mantra.** Overview first, zoom and filter, then details on demand. The canvas's overview state (low zoom, all ten nodes visible) must be legible without scroll. The detail state (high zoom or detail-panel-open) is where dense tables and small text are acceptable.

**P3 — One node, one purpose.** A node renders one concept. When a node accumulates a fourth or fifth concept, split it. The current `H1LoopNode` (~700 LoC, three view modes, two cloud reductions, two playback modes, layer comparison) is the boundary case; further additions should become a sibling node connected by an edge, not new tabs inside.

**P4 — Category color is identity. Sequential luminance is quantity.** The `CATEGORY_BORDER` palette on `BaseNodeShell` is the canonical identity channel; do not introduce competing identity hues inside node bodies. All quantitative encodings inside nodes use one of three sanctioned sequential ramps (see §5.3).

**P5 — Sign convention follows the upstream prior art.** Green = positive contribution / promoting / correct. Red = negative / opposing / incorrect. This already matches `ExplainWaterfallNode`'s `#4ade80` / `#f87171` and the Anthropic Circuit Tracer convention. Do not introduce purple for "negative" in new nodes; the upstream convention used purple, but this codebase has standardized on red and consistency within the repo beats consistency with one outside reference.

**P6 — Accessibility floor is WCAG 2.1 AA.** Every text-on-background pair must meet 4.5:1 contrast (3:1 for text >= 18 pt or 14 pt bold). Every non-text UI element required to understand the data must meet 3:1 against its background. `prefers-reduced-motion` is honored. Color is never the sole channel.

## 5. Concrete Rules for Nodes

### 5.1 Type Scale

A four-step type scale. Add these as Tailwind utilities in `frontend/src/index.css` so all nodes consume them through class names, not arbitrary `text-[Xpx]` values.

| Token | CSS size | Weight | Usage |
|---|---|---|---|
| `ngs-text-title` | 11 px | 600 | The uppercase node label inside `BaseNodeShell` header. Already roughly matches `text-xs` (12 px) at line 64; harmonize to 11 px for compactness. |
| `ngs-text-body` | 12 px | 400 | Default body text inside a node. Replaces all current `text-xs` (12 px) usage and `text-[12px]`. |
| `ngs-text-meta` | 10 px | 400 | Secondary metadata, axis labels, table cells. Replaces current `text-[10px]` and `text-[11px]` (collapse to one value). |
| `ngs-text-micro` | 9 px | 500 | Dense tertiary labels. Only allowed at zoom >= 1.0; hidden below per §6. Replaces all current `text-[8px]`, `text-[9px]`, and SVG `fontSize` values 6–9. |

SVG text inside nodes follows the same scale (`fontSize={11}`, `12`, `10`, `9`). The pre-existing `fontSize={6}` and `fontSize={7}` values in `BreathingHeatmapNode` must be raised to 9 minimum; if the heatmap legend cannot fit, the legend's layout changes, not its font size.

Number rendering uses `font-feature-settings: "tnum"` (tabular numerals) on a single utility class `ngs-tabular`. Drop both `font-mono` and inline `fontFamily="monospace"` for numeric display except where mono is genuinely needed (code paths, IDs).

### 5.2 Sizing and Spacing Tokens

The scoring canvas's three node sizes — 300, 340, 560, 760 px wide — are not a scale, they are eight ad-hoc values. Codify a three-step scale and round existing widths to it:

| Token | Width (px) | Use |
|---|---|---|
| `ngs-w-sm` | 300 | Single-metric or single-chart nodes (gauge, feature bars, persistence diagram, bridge monitor, drift matrix, hidden-state cloud) |
| `ngs-w-md` | 560 | Two-pane nodes (breathing heatmap, explain waterfall when expanded) |
| `ngs-w-lg` | 760 | Compound interactive nodes (H1 loop, future cross-canvas analyses) |

Heights follow the row in which the node lives (360, 340, 440 in the current scoring layout) rather than a separate scale, because the row layout is the dominant constraint.

Internal padding: 12 px horizontal, 8 px vertical at the node body level (`BaseNodeShell` currently uses `p-3` = 12 px on all sides; tighten vertical to 8 px to recover space in dense nodes). Gap between stacked sub-blocks: 8 px. Gap between adjacent rows of small atoms (a label + sparkline + value row): 2 px (current values vary between `gap-0.5` and `gap-1`).

### 5.3 Color Tokens

Three sanctioned palettes. Anything else inside a node body is a design exception that must be justified.

**Identity (categorical, hue-only).** The existing `CATEGORY_BORDER` map. Do not introduce a competing identity palette. Bodies stay neutral (`bg-neutral-900` dark / `bg-neutral-50` light from `index.css`).

**Sign (correctness / contribution direction).** Two colors: `#4ade80` (green-positive) and `#f87171` (red-negative). These are already used in `ExplainWaterfallNode`; standardize across `PromptInputNode`, `H1LoopNode`, `BreathingHeatmapNode`, and any node that displays a correctness flag.

**Magnitude (sequential, score / probability / drift / breathing).** Two ramps, chosen per data semantics:

- *Viridis* for "higher is better" data (confidence, score, contribution magnitude). Suggested 5-step quantization: `#440154 -> #3B528B -> #21908C -> #5DC863 -> #FDE725`. This replaces both the gauge's emerald/amber/red thresholds (which conflate magnitude with categorical alert) and the breathing heatmap's custom ramp.
- *Diverging Red-Blue* (`#053061 -> #F7F7F7 -> #67001F`) for "deviation from baseline" data — drift PSI scores, layer-breathing collapse ratios. This separates drift visualization from the green/amber/red alert palette so a viewer is not asked to read the same colors as two different things.

The `DriftMatrixNode` `SEVERITY_COLORS` (ok / warning / alert) is a separate axis — it encodes thresholded categories, not raw magnitude — and may keep its current palette as the alerting layer on top of the diverging-Red-Blue background. Layering is fine; conflating is not.

For colorblind safety: Viridis is perceptually uniform and CVD-safe by construction. The green / red sign pair fails for ~5% of users with red-green CVD; pair it with shape (a `+` or `-` glyph in the contribution number, a checkmark or X in correctness pills) so color is never the sole channel.

### 5.4 Borders, Radii, and Elevation

`BaseNodeShell` currently applies `rounded-lg` (8 px), 1-px border in the category color, and a `shadow-lg`. Keep these defaults. The `alertGlow` `shadow-[0_0_8px_rgba(239,68,68,0.3)]` is appropriate but must be gated on `@media (prefers-reduced-motion: no-preference)` so the pulse stops for reduced-motion users.

Selection state: `BaseNodeShell` currently delegates entirely to `NodeResizer` (which renders a 1-px `#3b82f6` outline plus 8-px handles when `selected`). This is fine, but the unselected-but-hovered state is undefined. Add a 1-px brighter border on `:hover` so users can see what they are about to select before clicking.

### 5.5 NodeResizer Minimums Per Node

Set `minWidth` and `minHeight` on the resizer per node based on the smallest layout the node can render without clipping. Recommended values, derived from the SVG dimensions in current code:

| Node | minWidth | minHeight |
|---|---|---|
| `prompt_input` | 280 | 200 |
| `confidence_gauge` | 240 | 200 |
| `feature_bars` | 280 | 280 |
| `persistence_diagram` | 280 | 280 |
| `hidden_state_cloud` | 280 | 260 |
| `bridge_monitor` | 320 | 200 |
| `explain_waterfall` | 320 | 240 |
| `drift_matrix` | 380 | 320 |
| `breathing_heatmap` | 520 | 360 |
| `h1_loop` | 560 | 380 |

Pass these through `BaseNodeShell` as new props `minWidth?: number, minHeight?: number` defaulting to the current `200 / 100`. Each node passes its required minimum.

## 6. Semantic Zoom Specification

Five tiers driven by `useStore` (`@xyflow/react`) reading `state.transform[2]` (the zoom scalar), exposed to nodes via a custom hook `useZoomTier()` that returns one of `"T0" | "T1" | "T2" | "T3" | "T4"`. Each node's render function consults the tier and chooses what to display.

| Tier | Zoom range | Default render |
|---|---|---|
| **T0 Overview** | < 0.30 | Solid filled rectangle in the node's category color (no shell border, no body content). Mini-map analog. |
| **T1 Map** | 0.30 – 0.55 | Category-colored rectangle with the node label (`ngs-text-title`) centered. No body chrome. |
| **T2 Mid** | 0.55 – 0.85 | `BaseNodeShell` with header, but body shows only the single most important glyph — gauge arc with no sparkline, feature bars with no value labels, breathing heatmap with no axis labels. |
| **T3 Detail** *(default mount zoom)* | 0.85 – 1.50 | Current full render: header, body, sparklines, axis labels, in-node controls. |
| **T4 Inspect** | > 1.50 | T3 plus the `ngs-text-micro` tier becomes visible (per-cell numeric values in tables, tooltip-equivalents pinned inline). |

The cutover zoom values are starting points; tune against actual reading at the user's display DPI. The implementation cost is roughly one hook plus per-node guards on the existing render trees; nodes that don't need a custom T0/T1 simply default to a `<div>` in their category color.

The performance budget at T0 is critical. At T0 the canvas may show the full ten-node scoring layout zoomed out to fit in the mini-map preview pane, plus the `row_label` backgrounds; node interiors should be plain styled `<div>` elements, not React components rendering Recharts / Three.js / SVG-heavy contents. The VisualFlow guidance for React Flow at scale is the relevant reference: complex node components are swapped for lightweight placeholders below ~0.5 zoom. For this codebase at N = 10, the perf gain is small at default zoom but meaningful when the mini-map is open or the user zooms out to navigate.

Text inside SVG (`<text>` elements in PersistenceDiagram, BreathingHeatmap, DriftMatrix, H1Loop subcomponents) scales linearly with React Flow zoom by default — the SVG is inside a `transform: scale(zoom)` container. At T2 and below this becomes illegible. Two acceptable mitigations: hide the SVG text entirely at T2 (preferred — the tier definition above already does this for axis labels and value labels) or use `vector-effect="non-scaling-stroke"` plus a manual font-size adjustment indexed on zoom (more code, more correctness). Pick the first by default.

## 7. Edge Rules

The scoring canvas's edges all carry the same port type (`features`) and the same data shape, so uniform styling is defensible. The rules below are the floor.

Default stroke width 2 px, color `var(--ngs-edge-stroke)` (already in place via `defaultEdgeOptions` in `SubstrateCanvas.tsx:18-26`). Default arrowhead `MarkerType.ArrowClosed`, 16 x 16, matching the stroke color.

Three states beyond default. *Active* — the edge transmitted a stream event in the last 500 ms — pulses opacity from 1.0 to 0.6 and back over 800 ms, gated on `prefers-reduced-motion`. *Stale* — the existing `StaleEdge` custom edge — applied automatically when the upstream node's drift severity is `warning` or `alert`. *Selected* — when either endpoint node is selected, raise opacity to 1.0 and width to 3 px; when neither is selected and any node is selected, drop opacity to 0.3.

Edge routing stays at React Flow's default bezier. Orthogonal routing is reserved for future canvas kinds where the layout is grid-aligned (ELK already supports this).

## 8. Interaction Patterns

Preserve what already works. `Escape` clears selection (`SubstrateCanvas.tsx:36-43`). Click selects, clicking the pane clears selection. `snapToGrid` with a 20 x 20 grid is on. `defaultEdgeOptions` and arrowheads are correct. The `cmdk` package is in `package.json` and per SPEC-v5 §6.1 powers global search; ensure the in-canvas node search uses the same trigger.

Add the following. Tab moves focus across nodes in their layout order (left-to-right, top-to-bottom). Enter opens the `DetailPanel` for the focused node. Arrow keys nudge a selected node by the grid step (20 px), 1 px with Shift held for fine adjustment. `Cmd+F` opens an in-canvas node finder filtered to the current canvas. `Cmd+0` resets zoom to fit; `Cmd+1` resets zoom to 1.0; `Cmd+plus` / `Cmd+minus` zoom in / out by one tier step.

Hover state: a 150 ms hover on a node raises a tooltip (Radix Tooltip is already implied by the Radix dialog dependency) with the node's full metadata — pack version, last-event timestamp, drift status, subscribed streams. This is the affordance for "what does this node show me" without opening the DetailPanel.

## 9. Accessibility Requirements

All node text against the dark `bg-neutral-900` background must hit 4.5:1 contrast. The current `text-neutral-300` on `bg-neutral-900` is ~10:1 and clears AAA. The `text-neutral-500` used heavily for metadata is ~4.6:1 on `bg-neutral-900` (just clears AA); `text-neutral-600` is ~3.7:1 and fails for body text — restrict it to non-text UI (1-px separators, disabled-state borders) where the 3:1 floor applies. Audit all uses of `text-neutral-500` and `text-neutral-600` against actual rendered pairs.

Honor `prefers-reduced-motion`. Affected code: the `animate-pulse` on the alert health band (`BaseNodeShell.tsx:41`), the camera tween in `useCameraTween`, the bridge pulse in `HiddenStateCloudNode`'s `BridgePulse`, the filtration playback in `H1LoopNode`, the demo cycling in `PromptInputNode`. For continuous animations, replace with a static appropriate visual (the alert band becomes solid red, the bridge pulse becomes a static larger sphere). For one-shot transitions, keep them — `reduce` does not mean "remove all animation," it means "no continuous motion."

Add `aria-label` to every interactive button. Audit the existing arrow buttons in `PromptInputNode`, `H1LoopNode`; they need labels like "Previous problem" beyond their `title` attribute.

The React Flow canvas itself needs a parallel-DOM accessibility tree. React Flow ships with `ariaLabel` support and an `accessibilityKeyboardCallbacks` prop; configure them. The canvas container is `role="application"` with `aria-roledescription="node graph"`. Each node has a computed `aria-label` of the form `"<category> node: <label>, status <ok|computing|alert>"`.

Focus indicators must be visible. The current `NodeResizer` outline appears on selection; add a 2-px outline on focus (keyboard) distinct from selection (click). Never set `outline: none` on focusable elements.

Color is never the sole channel. The correctness pills in `PromptInputNode` (checkmark / X) and `ExplainWaterfallNode` ("CORRECT" / "INCORRECT" text) already follow this. Audit any new state encoding for the same.

## 10. Rules for Creating New Node Types

The pack contract in SPEC-v5 §8 already requires a `NodeDef` declaration. The rules below are additive checks on top of that contract.

Before submitting a new node:

1. **Declare it in the pack manifest** (`packs/<pack>/manifest.ts`) with `typeId`, `label`, `category` (one of the six in `CATEGORY_BORDER`), `inputs`, `outputs`, `configFields`, `subscribesTo`. Lazy-load the component in `components/canvas/node-types.tsx` if it imports Three.js or Recharts.

2. **Render through `BaseNodeShell`.** Pass `label`, `category`, `inputs`, `outputs`, `status`, `healthStatus`. Do not introduce a competing shell. If you need a different shell, the discussion goes in this document first.

3. **Pass `minWidth` and `minHeight`** appropriate to the node's smallest legible layout. Default 200 x 100 is acceptable only for nodes that genuinely render no internal SVG and degrade gracefully.

4. **Implement five tiers** of `useZoomTier()` output. Tiers may share a render — `T3` and `T4` often will — but the function must terminate for all five. `T0` must be a flat colored rectangle in the node's category color.

5. **Consume the three color palettes** in §5.3. Category color = identity. Green / red = sign. Viridis or diverging Red-Blue = magnitude. Any new hue or any reuse of category hues inside the body needs a written justification.

6. **Use the four type tokens** in §5.1. No arbitrary `text-[Xpx]` values. No fontSize below 9 in SVG.

7. **Honor `prefers-reduced-motion`** for any animation longer than 300 ms or any animation that loops.

8. **Add an `aria-label`** to every interactive element and a parent `aria-label` describing the node's purpose.

9. **Source feature lists from a single module.** If your node iterates over the 13 topological features, import from `packs/topo-confidence/features.ts` (to be created) rather than redeclaring the list.

10. **Add at minimum one Cypress or Playwright spec** that mounts the node with mock data, verifies T3 renders without thrown errors, and verifies the `aria-label` is present. The repo already has Cypress wired up (`frontend/cypress/`) and SPEC-v5 §18 mandates this tier of test.

## 11. Anti-Patterns

The following are forbidden absent an explicit exception logged in a PR description:

1. Introducing a new font family or `font-mono` use on numeric display. Use `ngs-tabular`.
2. Inventing a new hue for "alert" / "warning" / "ok" outside the three palettes in §5.3.
3. Using purple, magenta, or orange inside a node body without coordinating with the category-border palette (these hues are reserved for future categorical expansion).
4. Drop-shadows or 3D bevels on node interiors.
5. Continuous animations longer than 500 ms that do not check `prefers-reduced-motion`.
6. SVG `fontSize` below 9 at zoom = 1.0.
7. Encoding probability or score on color hue alone. Use a sequential ramp.
8. Encoding "correct" only with color. Pair with shape or glyph.
9. Duplicating the 13-feature list in a fourth file.
10. `outline: none` on any element that can receive keyboard focus.
11. Adding a fifth tab to `H1LoopNode` or any other node with three or more existing tabs. Split into a sibling node.
12. Hardcoding `nodeColor` on the mini-map. The mini-map must reflect at least node category.

## 12. Open Questions

Decisions that need to be made before the next iteration of this document.

1. **Drift severity vs. sign confusion.** The diverging Red-Blue ramp proposed for drift PSI in §5.3 puts "high deviation" at red — the same hue as "negative contribution" in the sign palette. A user looking at the canvas sees red in `DriftMatrixNode` and red in `ExplainWaterfallNode` and reads them as the same kind of "bad." Either the drift visualization moves to a non-red ramp (e.g., the `viridis` reverse for "deviation magnitude"), or the sign palette swaps red for purple. I recommend the first; flag if you disagree.

2. **`H1LoopNode` complexity.** Per P3, this node is at the boundary. The Diagram / Replay / Text tabs each pull from the same underlying problem data but represent independent inspection modes. Splitting them into three sibling nodes that share state through a hidden state-carrier (analogous to `r2_state` in the link-forge pack) would reduce the single-node complexity but multiply edges. Decide: keep as one node with three tabs, or split.

3. **Mini-map encoding.** What does the mini-map's `nodeColor` show — category, drift severity, or both (e.g., border = category, fill = severity)? §3.8 flagged the issue; the fix is one prop, but the choice has implications for how the mini-map reads at a glance.

4. **Manual layout vs. ELK.** The scoring canvas is hand-positioned and that is the right choice for ten fixed nodes. If user-authored canvases extend the scoring kind with additional analysis nodes, the manual-layout assumption breaks. Decide: is the scoring canvas always a fixed shape, or is it user-editable? If editable, the `RowLabelNode` background-grouping pattern needs to dynamically resize with the user's nodes, which the current implementation does not.

5. **Mini-map node opacity at T0.** When the canvas zooms out to T0, the rendered nodes become the same flat rectangles the mini-map shows. The mini-map becomes redundant. Decide: hide the mini-map at T0, or keep it always visible.

6. **Light mode parity.** The `[data-theme="light"]` overrides in `index.css` invert neutrals but do not redefine the category palette, the sign palette, or the magnitude ramps. The Viridis ramp at the high end (`#FDE725` yellow) has poor contrast on `oklch(95% 0 0)` light background. Light mode needs its own pass through this document.

7. **Sparse data states.** Current "Waiting for X..." placeholders are inconsistent (`Waiting for data...`, `Waiting...`, `Waiting for hidden states...`, `Waiting for PH data...`, `Waiting for bridge health...`). Standardize on one phrasing and one location within the node body. Suggest centering vertically and showing the category-colored icon plus the text.

## 13. Caveats

This document was written against commit `9c70798` on the `main` branch. If files have moved or been refactored, line references will need updating; the principles will not.

The contrast and font-size analysis assumes a 1x DPI display. Aaron, if your primary work screen is HiDPI (most Apple silicon laptops, current XDR-class displays), the actual readability of `text-[10px]` is better than this document treats it. The 9-px floor in §5.1 is the conservative recommendation; pin it lower if you measure that you read 8 px comfortably on your hardware.

The "no purple in node bodies" rule (§11 item 3) collides with `H1LoopNode`'s use of `bg-purple-900/40` for the level metadata pill (line 312). Either grandfather it or change it; both are valid choices, but the rule needs a deliberate decision.

The §6 semantic-zoom tier values (0.30 / 0.55 / 0.85 / 1.50) are first-draft cutoffs. They will need empirical tuning. The right test is to put the canvas on a real display at the user's typical zoom range and ask: "at this zoom, can I read this node's headline number?" and adjust thresholds until the answer is yes at T2 and yes at T3.

Finally, the `experiments` and `link-forge` canvases share the substrate but have different node distributions and different scoring semantics (no confidence scores in `experiments`; aggregate paper flow in `link-forge`). This document is scoped to the `scoring` kind. A parallel document is warranted for each other kind if the gaps in their respective node sets are similar to the ones called out in §3.
