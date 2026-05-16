-- Phase 4: memory_drift_events
-- TS_GLOB_MS    = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
-- TS_GLOB_NO_MS = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'

CREATE TABLE IF NOT EXISTS memory_drift_events (
  id                  TEXT PRIMARY KEY,
  subject_entity_id   TEXT NOT NULL REFERENCES memory_entities(id),
  predicate           TEXT NOT NULL,
  conversation_value  TEXT,
  spec_value          TEXT,
  code_value          TEXT,
  drift_type          TEXT NOT NULL CHECK (drift_type IN (
    'spec_vs_code', 'conv_vs_code', 'conv_vs_spec', 'three_way',
    'regression_cluster', 'spec_violation_cluster', 'recurring_root_cause',
    'review_unfixed', 'review_vs_code', 'recurring_review_finding',
    'spec_clarification_recurring'
  )),
  severity            TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'error')),
  detected_at         TEXT NOT NULL CHECK (
    detected_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
    OR detected_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'
  ),
  resolved_at         TEXT CHECK (
    resolved_at IS NULL
    OR resolved_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
    OR resolved_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'
  ),
  resolution_note     TEXT NOT NULL DEFAULT '',
  detail_json         TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(detail_json)),
  UNIQUE (subject_entity_id, predicate, drift_type)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_memory_drift_events_subject
  ON memory_drift_events(subject_entity_id);

CREATE INDEX IF NOT EXISTS idx_memory_drift_events_unresolved
  ON memory_drift_events(resolved_at) WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_memory_drift_events_severity
  ON memory_drift_events(severity);

CREATE INDEX IF NOT EXISTS idx_memory_drift_events_detected_at
  ON memory_drift_events(detected_at);

CREATE INDEX IF NOT EXISTS idx_memory_drift_events_drift_type
  ON memory_drift_events(drift_type);
