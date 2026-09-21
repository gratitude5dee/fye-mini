-- Development-only World Labs catalog.  It contains operational state and
-- approved public asset metadata, never API keys, player identities, prompts
-- supplied by visitors, camera frames, or landmarks.
CREATE TABLE IF NOT EXISTS world_jobs (
  slug TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  error_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS worlds (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  splat_100k_url TEXT NOT NULL,
  splat_500k_url TEXT,
  collider_url TEXT NOT NULL,
  metric_scale_factor REAL NOT NULL,
  ground_plane_offset REAL NOT NULL,
  collider_transform_json TEXT,
  spawn_json TEXT,
  ritual_anchor_json TEXT,
  status TEXT NOT NULL CHECK (status IN ('calibrating', 'ready')),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS worlds_public_catalog ON worlds(active, status, title);
