-- Migration 007: search_index materialized view for Cmd+K.

CREATE MATERIALIZED VIEW search_index AS
  SELECT 'project' AS kind, id::text AS id, slug AS target_slug,
         display_name AS label, NULL::text AS sublabel,
         setweight(to_tsvector('english', display_name), 'A') AS tsv
  FROM projects
  UNION ALL
  SELECT 'canvas' AS kind, id::text AS id, slug AS target_slug,
         name AS label, kind AS sublabel,
         setweight(to_tsvector('english', name), 'A') AS tsv
  FROM graphs
  UNION ALL
  SELECT 'run' AS kind, id::text AS id, NULL::text AS target_slug,
         to_char(started_at, 'YYYY-MM-DD HH24:MI') AS label,
         status AS sublabel,
         to_tsvector('english', id::text || ' ' || COALESCE(status, '')) AS tsv
  FROM runs;

CREATE INDEX idx_search_tsv ON search_index USING gin(tsv);

-- Refresh policy: app-level cron every 30 seconds.
-- REFRESH MATERIALIZED VIEW CONCURRENTLY search_index;

-- Rollback:
-- DROP MATERIALIZED VIEW IF EXISTS search_index;
