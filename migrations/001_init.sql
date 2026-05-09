CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE graphs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  current_version INT NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name)
);

CREATE TABLE graph_versions (
  graph_id   UUID NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  version    INT  NOT NULL,
  snapshot   JSONB NOT NULL,
  message    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (graph_id, version)
);

CREATE TABLE nodes (
  id           TEXT PRIMARY KEY,
  graph_id     UUID NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  type_id      TEXT NOT NULL,
  type_version INT NOT NULL DEFAULT 1,
  position_x   REAL NOT NULL,
  position_y   REAL NOT NULL,
  width        REAL,
  height       REAL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON nodes (graph_id);

CREATE TABLE node_configs (
  node_id    TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON node_configs USING GIN (config jsonb_path_ops);

CREATE TABLE edges (
  id            TEXT PRIMARY KEY,
  graph_id      UUID NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  source        TEXT NOT NULL,
  target        TEXT NOT NULL,
  source_handle TEXT,
  target_handle TEXT,
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ON edges (graph_id);
