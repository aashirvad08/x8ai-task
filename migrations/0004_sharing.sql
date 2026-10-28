-- Share links: read-only access to a lab's published tasks for reviewers without an account, at /v/<token>.
-- The token is kept so the lab's owners can copy the link again; revoking or expiring it ends access.
CREATE TABLE share_links (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  lab_id TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- 'lab': every published task, including ones published later; 'tasks': only those listed in share_tasks
  scope TEXT NOT NULL CHECK (scope IN ('lab', 'tasks')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER,
  views INTEGER NOT NULL DEFAULT 0,
  last_viewed_at INTEGER
);
CREATE INDEX share_links_lab ON share_links (lab_id, created_at);

CREATE TABLE share_tasks (
  share_id TEXT NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (share_id, task_id)
);
CREATE INDEX share_tasks_task ON share_tasks (task_id);
