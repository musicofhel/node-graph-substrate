-- Backfill row_label node configs.
-- Previous code stored label/color at data.label/data.color (top-level),
-- but the save path only persists data.config. Existing row_label nodes
-- have config = '{}'. This restores the correct config values.

INSERT INTO node_configs (node_id, config, updated_at)
SELECT n.id,
  CASE n.id
    WHEN 'row-input'   THEN '{"label": "Input & Summary", "color": "blue"}'::jsonb
    WHEN 'row-topo'    THEN '{"label": "Topology & Health", "color": "cyan"}'::jsonb
    WHEN 'row-complex' THEN '{"label": "Complex Visualizations", "color": "purple"}'::jsonb
  END,
  NOW()
FROM nodes n
WHERE n.type_id = 'row_label'
  AND n.id IN ('row-input', 'row-topo', 'row-complex')
ON CONFLICT (node_id) DO UPDATE
  SET config = EXCLUDED.config,
      updated_at = NOW()
  WHERE node_configs.config = '{}'::jsonb;
