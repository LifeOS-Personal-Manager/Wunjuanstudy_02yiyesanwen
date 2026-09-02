ALTER TABLE essays ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE essays ADD COLUMN source_url TEXT NOT NULL DEFAULT '';
ALTER TABLE essays ADD COLUMN source_retrieved_at TEXT;

CREATE INDEX idx_essays_owner_updated
  ON essays(owner_id, updated_at DESC);

CREATE TABLE source_snapshots (
  id TEXT PRIMARY KEY,
  essay_id TEXT NOT NULL REFERENCES essays(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256) = 64),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  retrieved_at TEXT NOT NULL
);

CREATE INDEX idx_source_snapshots_essay
  ON source_snapshots(essay_id, retrieved_at DESC);

CREATE TABLE usage_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_usage_events_owner_action_created
  ON usage_events(owner_id, action, created_at DESC);
