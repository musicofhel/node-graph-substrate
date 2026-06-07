-- Backfill scoring node widths from CanvasPage dashboard grid defaults.
-- These nodes use style.width as a CSS constraint; without it in the DB
-- the width is lost on reload and nodes fall back to minWidth.

UPDATE nodes SET
  width = CASE id
    WHEN 'prompt-1'    THEN 300
    WHEN 'gauge-1'     THEN 300
    WHEN 'features-1'  THEN 300
    WHEN 'explain-1'   THEN 340
    WHEN 'cloud-1'     THEN 300
    WHEN 'diagram-1'   THEN 300
    WHEN 'monitor-1'   THEN 300
    WHEN 'drift-1'     THEN 300
    WHEN 'breathing-1' THEN 560
    WHEN 'h1loop-1'    THEN 760
  END,
  updated_at = NOW()
WHERE id IN ('prompt-1', 'gauge-1', 'features-1', 'explain-1',
             'cloud-1', 'diagram-1', 'monitor-1', 'drift-1',
             'breathing-1', 'h1loop-1')
  AND width IS NULL;
