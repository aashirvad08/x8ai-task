-- Labs post tasks; nobody outside a lab sees its tasks, runs, screenshots or members.
CREATE TABLE labs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- {"criteria": "checks" | "score"}: how the scores sheet measures criteria achievement
  settings TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at INTEGER NOT NULL
);

-- The platform admin has no lab; everyone else belongs to exactly one.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'owner', 'member')),
  lab_id TEXT REFERENCES labs(id) ON DELETE CASCADE,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER,
  CHECK ((role = 'admin') = (lab_id IS NULL))
);
CREATE INDEX users_lab ON users (lab_id);

-- The cookie holds a random token; only its SHA-256 is stored.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

-- One-time links that let someone create an account in a lab. Only the token's SHA-256 is stored.
CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  email TEXT COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  used_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX invites_lab ON invites (lab_id);

-- A task with its runs, write-ups and failure modes. Steps and screenshots live in the bucket under labs/<lab id>/.
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  position INTEGER NOT NULL DEFAULT 0,
  run_count INTEGER NOT NULL DEFAULT 0,
  step_count INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  -- For links from the first version of the viewer: the first step of each recorded turn, per run.
  legacy TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX tasks_lab ON tasks (lab_id, position);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  user_id TEXT,
  lab_id TEXT,
  action TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX audit_log_lab ON audit_log (lab_id, at);
