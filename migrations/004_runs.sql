-- Migration 004: runs table with race-safe creation.

CREATE TABLE runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id           UUID NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  run_id_external     TEXT NOT NULL,
  graph_version       INTEGER NOT NULL,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at         TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running', 'completed', 'failed', 'aborted')),
  kind_specific_data  JSONB NOT NULL DEFAULT '{}'::jsonb,

  UNIQUE (canvas_id, run_id_external),
  FOREIGN KEY (canvas_id, graph_version)
    REFERENCES graph_versions (graph_id, version)
);

CREATE INDEX idx_runs_canvas_started ON runs (canvas_id, started_at DESC);
CREATE INDEX idx_runs_status ON runs (status) WHERE status = 'running';

-- Rollback:
-- DROP INDEX IF EXISTS idx_runs_status;
-- DROP INDEX IF EXISTS idx_runs_canvas_started;
-- DROP TABLE IF EXISTS runs;
