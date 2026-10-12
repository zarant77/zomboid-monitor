CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  steam_id TEXT NOT NULL UNIQUE CHECK(length(steam_id)=17),
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE auth_attempts (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_attempts_expiry ON auth_attempts(expires_at);
CREATE TABLE auth_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
