-- One row per device that turned notifications on. Only the sha256 of the
-- device's key is stored; the endpoint/keys are what the browser handed over.
CREATE TABLE subs (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  updated TEXT NOT NULL
);

-- Exact per-IP write counter, one row per IP per hour (see src/index.ts).
CREATE TABLE write_hits (
  ip TEXT NOT NULL,
  hour INTEGER NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (ip, hour)
);
