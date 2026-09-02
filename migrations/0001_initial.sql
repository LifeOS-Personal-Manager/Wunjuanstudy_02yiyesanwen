PRAGMA foreign_keys = ON;

CREATE TABLE essays (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  author TEXT NOT NULL CHECK (length(author) BETWEEN 1 AND 120),
  original_text TEXT NOT NULL CHECK (length(original_text) > 0),
  original_text_sha256 TEXT NOT NULL CHECK (length(original_text_sha256) = 64),
  source_name TEXT NOT NULL DEFAULT '',
  copyright_notice TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'analyzing', 'editing', 'ready', 'archived')),
  publication_copy TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_essays_updated_at ON essays(updated_at DESC);

CREATE TABLE analysis_runs (
  id TEXT PRIMARY KEY,
  essay_id TEXT NOT NULL REFERENCES essays(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('essay', 'card')),
  target_card_id TEXT REFERENCES cards(id) ON DELETE SET NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  request_json TEXT NOT NULL DEFAULT '{}',
  response_json TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

CREATE INDEX idx_analysis_runs_essay_created
  ON analysis_runs(essay_id, created_at DESC);

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  essay_id TEXT NOT NULL REFERENCES essays(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL
    CHECK (purpose IN ('source_image', 'rendered_image', 'export_bundle')),
  r2_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/zip')),
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX idx_assets_essay_created ON assets(essay_id, created_at DESC);

CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  essay_id TEXT NOT NULL REFERENCES essays(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('cover', 'body', 'ending')),
  position INTEGER NOT NULL CHECK (position >= 0),
  source_start INTEGER NOT NULL CHECK (source_start >= 0),
  source_end INTEGER NOT NULL CHECK (source_end >= source_start),
  source_excerpt TEXT NOT NULL,
  editor_guide TEXT NOT NULL DEFAULT '',
  scene_description TEXT NOT NULL DEFAULT '',
  image_prompt TEXT NOT NULL DEFAULT '',
  text_position_json TEXT NOT NULL DEFAULT '{}',
  crop_json TEXT NOT NULL DEFAULT '{}',
  template_settings_json TEXT NOT NULL DEFAULT '{}',
  source_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  rendered_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  source_status TEXT NOT NULL DEFAULT 'valid'
    CHECK (source_status IN ('valid', 'source_stale', 'invalid')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (essay_id, position)
);

CREATE INDEX idx_cards_essay_position ON cards(essay_id, position);

CREATE TABLE export_jobs (
  id TEXT PRIMARY KEY,
  essay_id TEXT NOT NULL REFERENCES essays(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'collecting', 'ready', 'failed')),
  format TEXT NOT NULL CHECK (format IN ('png', 'jpeg')),
  manifest_json TEXT NOT NULL DEFAULT '{}',
  bundle_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  error_message TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX idx_export_jobs_essay_created
  ON export_jobs(essay_id, created_at DESC);
