CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  layer_id TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS snapshots_layer_time
  ON snapshots (layer_id, captured_at);
