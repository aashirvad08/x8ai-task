-- Uploads: tasks are identified within their lab by the package's folder name, and each upload is a new version.

-- The package folder name. Uploading the same name again replaces the task.
ALTER TABLE tasks ADD COLUMN folder TEXT;
UPDATE tasks SET folder = id WHERE folder IS NULL;
CREATE UNIQUE INDEX tasks_lab_folder ON tasks (lab_id, folder);

-- Steps are stored per version, so a replacement goes live in one step and the old version is then removed.
ALTER TABLE tasks ADD COLUMN version TEXT NOT NULL DEFAULT 'v0';

-- Every screenshot a lab has stored, by content hash. Uploads send only the ones missing here.
CREATE TABLE lab_frames (
  lab_id TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (lab_id, hash)
);

-- Which screenshots each task uses, so a deleted or replaced task's unused screenshots can be removed.
CREATE TABLE task_frames (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  PRIMARY KEY (task_id, hash)
);
CREATE INDEX task_frames_hash ON task_frames (hash);

-- An upload in progress: steps arrive first, then the task itself in one final request.
CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  folder TEXT NOT NULL,
  task_id TEXT NOT NULL,
  replaces INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX uploads_lab ON uploads (lab_id, created_at);
