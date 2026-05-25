-- Migration 003: project-level pack versioning + canvas kind and slug.

ALTER TABLE projects ADD COLUMN pack_versions JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE graphs ADD COLUMN kind TEXT;
ALTER TABLE graphs ADD COLUMN pack_id TEXT;
ALTER TABLE graphs ADD COLUMN pack_versions_override JSONB;
ALTER TABLE graphs ADD COLUMN slug TEXT;

-- Kind backfill from existing node types, using snake_case prefixes.
WITH node_signatures AS (
  SELECT
    graph_id,
    bool_or(type_id LIKE 'lf\_%' ESCAPE '\') AS has_lf,
    bool_or(type_id LIKE 'r2\_%' ESCAPE '\') AS has_r2,
    bool_or(type_id LIKE 'research\_%' ESCAPE '\') AS has_research,
    bool_or(type_id LIKE 'experiment\_%' ESCAPE '\'
            OR type_id IN ('algorithm_selector', 'findings_summary')) AS has_experiments
  FROM nodes
  GROUP BY graph_id
)
UPDATE graphs g
SET
  kind = CASE
    WHEN ns.has_experiments THEN 'experiments'
    WHEN ns.has_r2 THEN 'research2'
    WHEN ns.has_research OR ns.has_lf THEN 'research'
    ELSE 'pipeline'
  END,
  pack_id = CASE
    WHEN ns.has_experiments THEN 'experiments'
    WHEN ns.has_r2 OR ns.has_research OR ns.has_lf THEN 'link-forge'
    ELSE 'topo-confidence'
  END
FROM node_signatures ns
WHERE g.id = ns.graph_id;

-- Graphs with no nodes default to pipeline / topo-confidence.
UPDATE graphs SET kind = 'pipeline', pack_id = 'topo-confidence'
WHERE kind IS NULL;

-- Slug backfill with collision avoidance via window function.
WITH slugified AS (
  SELECT
    id, project_id,
    lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) AS base_slug,
    row_number() OVER (
      PARTITION BY project_id, lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
      ORDER BY id
    ) AS rn
  FROM graphs
)
UPDATE graphs g
SET slug = CASE WHEN s.rn = 1 THEN s.base_slug ELSE s.base_slug || '-' || s.rn::text END
FROM slugified s
WHERE g.id = s.id;

-- Default project-level pack_versions for existing projects.
UPDATE projects SET pack_versions = '{
  "core": "0.1.0",
  "topo-confidence": "0.1.0",
  "experiments": "0.1.0",
  "link-forge": "0.1.0"
}'::jsonb
WHERE pack_versions = '{}'::jsonb;

ALTER TABLE graphs ALTER COLUMN kind SET NOT NULL;
ALTER TABLE graphs ALTER COLUMN pack_id SET NOT NULL;
ALTER TABLE graphs ALTER COLUMN slug SET NOT NULL;

CREATE INDEX idx_graphs_project_kind ON graphs (project_id, kind);
CREATE UNIQUE INDEX uq_graphs_project_slug ON graphs (project_id, slug);

-- Rollback:
-- DROP INDEX IF EXISTS uq_graphs_project_slug;
-- DROP INDEX IF EXISTS idx_graphs_project_kind;
-- ALTER TABLE graphs DROP COLUMN IF EXISTS slug;
-- ALTER TABLE graphs DROP COLUMN IF EXISTS pack_versions_override;
-- ALTER TABLE graphs DROP COLUMN IF EXISTS pack_id;
-- ALTER TABLE graphs DROP COLUMN IF EXISTS kind;
-- ALTER TABLE projects DROP COLUMN IF EXISTS pack_versions;
