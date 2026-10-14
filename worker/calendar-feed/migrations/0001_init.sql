-- One row per calendar feed. Only the sha256 of the write key is stored.
CREATE TABLE feeds (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  ics TEXT NOT NULL,
  updated TEXT NOT NULL
);

-- Exact per-IP write counter, one row per IP per hour (see src/index.ts).
CREATE TABLE write_hits (
  ip TEXT NOT NULL,
  hour INTEGER NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (ip, hour)
);
