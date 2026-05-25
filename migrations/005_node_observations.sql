-- Migration 005: node_observations partitioned via pg_partman.

CREATE SCHEMA IF NOT EXISTS partman;
CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA partman;

CREATE TABLE node_observations (
  node_id    TEXT NOT NULL,
  ts         TIMESTAMPTZ NOT NULL,
  run_id     UUID REFERENCES runs(id) ON DELETE CASCADE,
  value      JSONB NOT NULL,
  PRIMARY KEY (node_id, ts)
) PARTITION BY RANGE (ts);

CREATE INDEX idx_node_obs_run ON node_observations (run_id, ts) WHERE run_id IS NOT NULL;

SELECT partman.create_parent(
  p_parent_table => 'public.node_observations',
  p_control => 'ts',
  p_interval => '1 month',
  p_premake => 3
);

-- Rollback:
-- DROP TABLE IF EXISTS node_observations CASCADE;
-- DROP EXTENSION IF EXISTS pg_partman;
