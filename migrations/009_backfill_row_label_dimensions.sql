-- Backfill row_label node dimensions.
-- Row label background panels need explicit width/height since they have
-- no content to size from. Without these, style: { width: undefined }
-- renders the panels as tiny instead of spanning the full row.

UPDATE nodes SET
  width = CASE id
    WHEN 'row-input'   THEN 1360
    WHEN 'row-topo'    THEN 1360
    WHEN 'row-complex' THEN 1360
  END,
  height = CASE id
    WHEN 'row-input'   THEN 360
    WHEN 'row-topo'    THEN 340
    WHEN 'row-complex' THEN 440
  END,
  updated_at = NOW()
WHERE type_id = 'row_label'
  AND id IN ('row-input', 'row-topo', 'row-complex')
  AND (width IS NULL OR height IS NULL);
