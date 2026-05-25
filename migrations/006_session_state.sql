-- Migration 006: workspace session state for tab restore.

CREATE TABLE workspace_session_state (
  project_id        UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  open_canvas_ids   UUID[] NOT NULL DEFAULT '{}',
  active_canvas_id  UUID REFERENCES graphs(id),
  per_canvas_state  JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rollback:
-- DROP TABLE IF EXISTS workspace_session_state;
