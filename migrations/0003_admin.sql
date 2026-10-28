-- One-time links for setting a new password. There is no email, so the admin creates them and passes them on.
-- Only the token's SHA-256 is stored.
CREATE TABLE password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX password_resets_user ON password_resets (user_id);

-- The activity log is read newest first, for every lab or one.
CREATE INDEX audit_log_at ON audit_log (at);
CREATE INDEX uploads_open ON uploads (finished_at, created_at);
CREATE INDEX lab_frames_created ON lab_frames (created_at);
