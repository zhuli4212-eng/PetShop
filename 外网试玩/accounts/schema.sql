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

CREATE TABLE IF NOT EXISTS petshop_public_config (
  id TEXT PRIMARY KEY,
  snapshot TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS petshop_public_rounds (
  id TEXT PRIMARY KEY,
  round_index INTEGER NOT NULL UNIQUE,
  close_at INTEGER NOT NULL,
  result_at INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  ranking TEXT
);
CREATE TABLE IF NOT EXISTS petshop_public_entries (
  round_id TEXT NOT NULL REFERENCES petshop_public_rounds(id),
  account_id TEXT NOT NULL REFERENCES trial_accounts(id),
  username TEXT NOT NULL,
  entry TEXT NOT NULL,
  PRIMARY KEY (round_id,account_id)
);
