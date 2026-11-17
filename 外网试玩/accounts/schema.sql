CREATE TABLE IF NOT EXISTS trial_accounts (
  id TEXT PRIMARY KEY,
  name_key TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  snapshot TEXT NOT NULL,
  password_hash TEXT
);
CREATE TABLE IF NOT EXISTS trial_sessions (
  digest TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES trial_accounts(id),
  expires_at INTEGER NOT NULL,
  setup_digest TEXT,
  setup_expires_at INTEGER
);
CREATE INDEX IF NOT EXISTS trial_sessions_expiry ON trial_sessions(expires_at);
CREATE TABLE IF NOT EXISTS trial_auth_limits (
  bucket TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS trial_limits_expiry ON trial_auth_limits(expires_at);
