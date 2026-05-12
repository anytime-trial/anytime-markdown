-- 012_function_entity_lifecycle.sql
-- Function entity + lifecycle columns (content_hash, valid_until, superseded_by, repo_name)
-- ON DELETE handling and CHECK constraint extension require full table recreation (12-step).

PRAGMA foreign_keys = OFF;

CREATE TABLE memory_entities__new (
  id               TEXT PRIMARY KEY,
  type             TEXT NOT NULL CHECK (type IN (
    'Person','Project','Package','File','Library','Tool','Concept','Decision',
    'Bug','Task','Skill','Rule','Commit','Question',
    'Review','ReviewFinding','Function'
  )),
  canonical_name   TEXT NOT NULL,
  display_name     TEXT NOT NULL,
  aliases_json     TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(aliases_json)),
  tags_json        TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json)),
  attributes_json  TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attributes_json)),
  summary          TEXT NOT NULL DEFAULT '',
  embedding        BLOB,
  content_hash     TEXT,
  repo_name        TEXT,
  valid_until      TEXT CHECK (
    valid_until IS NULL
    OR valid_until GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
    OR valid_until GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'
  ),
  superseded_by    TEXT REFERENCES memory_entities__new(id) ON DELETE SET NULL,
  first_seen_at    TEXT NOT NULL CHECK (first_seen_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR first_seen_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  last_updated_at  TEXT NOT NULL CHECK (last_updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR last_updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  recorded_at      TEXT NOT NULL CHECK (recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  UNIQUE (type, canonical_name)
) STRICT;

INSERT INTO memory_entities__new
  (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
   summary, embedding, first_seen_at, last_updated_at, recorded_at)
SELECT
  id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
  summary, embedding, first_seen_at, last_updated_at, recorded_at
FROM memory_entities;

DROP TABLE memory_entities;
ALTER TABLE memory_entities__new RENAME TO memory_entities;

CREATE INDEX idx_memory_entities_type ON memory_entities(type);
CREATE INDEX idx_memory_entities_last_updated ON memory_entities(last_updated_at);
CREATE INDEX idx_memory_entities_content_hash ON memory_entities(content_hash);
CREATE INDEX idx_memory_entities_valid_until ON memory_entities(valid_until);
CREATE INDEX idx_memory_entities_repo_name ON memory_entities(repo_name);

PRAGMA foreign_keys = ON;
