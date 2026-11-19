-- Due-date alerts the app uploaded for a device. The app replaces the whole
-- list on every change; `sent` survives a replace for an unchanged alert so a
-- re-upload never causes a second notification.
CREATE TABLE alerts (
  sub_id TEXT NOT NULL,
  key TEXT NOT NULL,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  hash TEXT NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sub_id, key)
);
CREATE INDEX alerts_due ON alerts (date, sent);
