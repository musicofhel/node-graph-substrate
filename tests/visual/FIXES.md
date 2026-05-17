# Visual Test Fixes (2026-05-16)

## Test Infrastructure

- `tests/visual/specs/*.yaml` -- 8 YAML test specs (one per pipeline node)
- `tests/visual/run_visual_tests.py` -- Playwright screenshot loop runner with DOM validation and alignment checks
- Validation run: all 7 auto-placed nodes PASS, drift_matrix NOT_FOUND (palette-only, expected)

## Bugs Found & Fixed

### 1. ConfidenceGaugeNode arc clipping

**File**: `frontend/src/components/nodes/ConfidenceGaugeNode.tsx`

**Problem**: Arc center CY=60 in a 70px-tall viewBox left only 10px clearance below endpoints. With strokeWidth=8 and strokeLinecap="round", the visual extent reached y=64, clipping the percentage text, sparkline, and mode label.

**Fix**: Reduced radius (50->46), moved center up (CY 60->52), adjusted viewBox height (70->66), text y offset adjusted.

```
Before: ARC_R=50, CX=60, CY=60, viewBox="0 0 120 70"
After:  ARC_R=46, CX=60, CY=52, viewBox="0 0 120 66"
```

### 2. BridgeMonitorNode right column truncated

**File**: `frontend/src/components/nodes/BridgeMonitorNode.tsx`

**Problem**: 240px container width was too narrow for the 4-column table (Layer, Bridge, Pos-0 Sil, Mean Sil). The "Mean Sil" header and values were clipped, along with the crystallization metric.

**Fix**: Container width 240->280px.

### 3. Sparkline gradient ID collision

**File**: `frontend/src/components/nodes/Sparkline.tsx`

**Problem**: All sparklines with identical dimensions (e.g., 13 FeatureBars sparklines at 40x12) shared the gradient ID `spark-grad-40-12`. Since SVG gradient IDs are document-global, only the first gradient definition's color was used for all sparklines.

**Fix**: Appended color hex to gradient ID: `spark-grad-${width}-${height}-${color.replace("#", "")}`.

### 4. MiniMap overlapping ExplainWaterfallNode

**File**: `frontend/src/components/canvas/SubstrateCanvas.tsx`

**Problem**: Default MiniMap position (bottom-right) rendered green node rectangles directly over the ExplainWaterfall's bar content area.

**Fix**: Repositioned MiniMap to `position="bottom-left"`.

### 5. Event log panel obscuring screenshots

**File**: `tests/visual/run_visual_tests.py`

**Problem**: The 250px event log panel reduced the ReactFlow canvas viewport, causing nodes near the bottom to be partially hidden during screenshot capture.

**Fix**: Test runner programmatically closes the event log panel and hides the MiniMap before capturing screenshots.

## Validation

All alignment checks pass:
- Confidence gauge: arcs share start point, same radius, no viewBox clip, text centered
- Bridge monitor: 4 headers, 4 cells/row, all columns visible
- Explain waterfall: 13 rows, 0px left/right spread, no minimap overlap
- Feature bars: 13 sparklines with unique per-color gradient IDs
- Persistence diagram: axes share origin, diagonal + scatter points + legend
