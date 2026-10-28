// Reads for the admin portal. Only admin pages and actions call these; each of them checks the admin first.
import { bindings } from "./env";

const DAY = 86_400_000;
export const STALE_AFTER = DAY;

export type SiteTotals = {
  labs: number;
  paused: number;
  people: number;
  disabled: number;
  published: number;
  drafts: number;
  runs: number;
  steps: number;
  frames: number;
  frameBytes: number;
  stepBytes: number;
};

// What each lab stores: its screenshots once each, plus every task's current steps.
const STEP_BYTES = `(SELECT COALESCE(SUM(t.bytes - COALESCE((SELECT SUM(lf.bytes) FROM task_frames tf JOIN lab_frames lf ON lf.hash = tf.hash AND lf.lab_id = t.lab_id WHERE tf.task_id = t.id), 0)), 0) FROM tasks t WHERE t.lab_id = l.id)`;

export async function siteTotals(): Promise<SiteTotals> {
  const { db } = await bindings();
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM labs) AS labs, (SELECT COUNT(*) FROM labs WHERE status = 'suspended') AS paused,
              (SELECT COUNT(*) FROM users WHERE role != 'admin') AS people, (SELECT COUNT(*) FROM users WHERE disabled = 1) AS disabled,
              (SELECT COUNT(*) FROM tasks WHERE status = 'published') AS published, (SELECT COUNT(*) FROM tasks WHERE status = 'draft') AS drafts,
              (SELECT COALESCE(SUM(run_count), 0) FROM tasks) AS runs, (SELECT COALESCE(SUM(step_count), 0) FROM tasks) AS steps,
              (SELECT COUNT(*) FROM lab_frames) AS frames, (SELECT COALESCE(SUM(bytes), 0) FROM lab_frames) AS frameBytes,
              (SELECT COALESCE(SUM(${STEP_BYTES}), 0) FROM labs l) AS stepBytes`,
    )
    .first<SiteTotals>();
  return row as SiteTotals;
}

export type Attention = { staleUploads: number; orphanFrames: number; orphanBytes: number; pausedLabs: number; expiringInvites: number };

const ORPHANS = `FROM lab_frames lf WHERE lf.created_at < ?
  AND NOT EXISTS (SELECT 1 FROM task_frames tf JOIN tasks t ON t.id = tf.task_id WHERE tf.hash = lf.hash AND t.lab_id = lf.lab_id)`;

export async function attention(): Promise<Attention> {
  const { db } = await bindings();
  const now = Date.now();
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM uploads WHERE finished_at IS NULL AND created_at < ?1) AS staleUploads,
              (SELECT COUNT(*) ${ORPHANS.replace("?", "?1")}) AS orphanFrames,
              (SELECT COALESCE(SUM(lf.bytes), 0) ${ORPHANS.replace("?", "?1")}) AS orphanBytes,
              (SELECT COUNT(*) FROM labs WHERE status = 'suspended') AS pausedLabs,
              (SELECT COUNT(*) FROM invites WHERE used_at IS NULL AND expires_at > ?2 AND expires_at < ?3) AS expiringInvites`,
    )
    .bind(now - STALE_AFTER, now, now + DAY)
    .first<Attention>();
  return row as Attention;
}

export type LabRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  settings: string;
  status: "active" | "suspended";
  created_at: number;
  people: number;
  owners: number;
  tasks: number;
  drafts: number;
  runs: number;
  steps: number;
  frames: number;
  frameBytes: number;
  stepBytes: number;
  lastActivity: number | null;
};

const LAB_COLUMNS = `l.id, l.slug, l.name, l.description, l.settings, l.status, l.created_at,
  (SELECT COUNT(*) FROM users u WHERE u.lab_id = l.id) AS people,
  (SELECT COUNT(*) FROM users u WHERE u.lab_id = l.id AND u.role = 'owner') AS owners,
  (SELECT COUNT(*) FROM tasks t WHERE t.lab_id = l.id) AS tasks,
  (SELECT COUNT(*) FROM tasks t WHERE t.lab_id = l.id AND t.status = 'draft') AS drafts,
  (SELECT COALESCE(SUM(run_count), 0) FROM tasks t WHERE t.lab_id = l.id) AS runs,
  (SELECT COALESCE(SUM(step_count), 0) FROM tasks t WHERE t.lab_id = l.id) AS steps,
  (SELECT COUNT(*) FROM lab_frames f WHERE f.lab_id = l.id) AS frames,
  (SELECT COALESCE(SUM(bytes), 0) FROM lab_frames f WHERE f.lab_id = l.id) AS frameBytes,
  ${STEP_BYTES} AS stepBytes,
  (SELECT MAX(at) FROM audit_log a WHERE a.lab_id = l.id) AS lastActivity`;

export async function labs(): Promise<LabRow[]> {
  const { db } = await bindings();
  return (await db.prepare(`SELECT ${LAB_COLUMNS} FROM labs l ORDER BY l.name COLLATE NOCASE`).all<LabRow>()).results;
}

export async function lab(id: string): Promise<LabRow | null> {
  const { db } = await bindings();
  return db.prepare(`SELECT ${LAB_COLUMNS} FROM labs l WHERE l.id = ?`).bind(id).first<LabRow>();
}

export type PersonRow = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "owner" | "member";
  disabled: number;
  created_at: number;
  last_login_at: number | null;
  lab_id: string | null;
  lab_name: string | null;
  lab_slug: string | null;
};

export async function people(labId?: string): Promise<PersonRow[]> {
  const { db } = await bindings();
  const q = db.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.disabled, u.created_at, u.last_login_at, l.id AS lab_id, l.name AS lab_name, l.slug AS lab_slug
       FROM users u LEFT JOIN labs l ON l.id = u.lab_id
      ${labId ? "WHERE u.lab_id = ?" : ""}
      ORDER BY l.name IS NOT NULL, l.name COLLATE NOCASE, u.role = 'member', u.email`,
  );
  return (await (labId ? q.bind(labId) : q).all<PersonRow>()).results;
}

export type InviteRow = { id: string; email: string | null; role: string; created_at: number; expires_at: number; lab_id: string; lab_name: string; by: string | null };

export async function openInvites(labId?: string): Promise<InviteRow[]> {
  const { db } = await bindings();
  const q = db.prepare(
    `SELECT i.id, i.email, i.role, i.created_at, i.expires_at, l.id AS lab_id, l.name AS lab_name, COALESCE(NULLIF(u.name, ''), u.email) AS by
       FROM invites i JOIN labs l ON l.id = i.lab_id LEFT JOIN users u ON u.id = i.created_by
      WHERE i.used_at IS NULL AND i.expires_at > ? ${labId ? "AND i.lab_id = ?" : ""}
      ORDER BY i.created_at DESC`,
  );
  return (await (labId ? q.bind(Date.now(), labId) : q.bind(Date.now())).all<InviteRow>()).results;
}

export type TaskRow = {
  id: string;
  folder: string;
  code: string;
  name: string;
  status: "draft" | "published";
  run_count: number;
  step_count: number;
  bytes: number;
  created_at: number;
  updated_at: number;
  lab_id: string;
  lab_name: string;
  by: string | null;
};

export async function tasks(filter: { lab?: string; status?: string } = {}): Promise<TaskRow[]> {
  const { db } = await bindings();
  const where: string[] = [];
  const args: string[] = [];
  if (filter.lab) {
    where.push("t.lab_id = ?");
    args.push(filter.lab);
  }
  if (filter.status === "draft" || filter.status === "published") {
    where.push("t.status = ?");
    args.push(filter.status);
  }
  return (
    await db
      .prepare(
        `SELECT t.id, t.folder, t.code, t.name, t.status, t.run_count, t.step_count, t.bytes, t.created_at, t.updated_at,
                l.id AS lab_id, l.name AS lab_name, COALESCE(NULLIF(u.name, ''), u.email) AS by
           FROM tasks t JOIN labs l ON l.id = t.lab_id LEFT JOIN users u ON u.id = t.created_by
          ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY t.updated_at DESC`,
      )
      .bind(...args)
      .all<TaskRow>()
  ).results;
}

export type ActivityRow = {
  id: number;
  at: number;
  action: string;
  detail: string | null;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  lab_id: string | null;
  lab_name: string | null;
};

export async function activity(filter: { lab?: string; kind?: string; before?: number; limit?: number } = {}): Promise<ActivityRow[]> {
  const { db } = await bindings();
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (filter.lab) {
    where.push("a.lab_id = ?");
    args.push(filter.lab);
  }
  if (filter.kind && /^[a-z]+$/.test(filter.kind)) {
    where.push("a.action LIKE ?");
    args.push(`${filter.kind}.%`);
  }
  if (filter.before) {
    where.push("a.id < ?");
    args.push(filter.before);
  }
  return (
    await db
      .prepare(
        `SELECT a.id, a.at, a.action, a.detail, a.user_id, u.name AS user_name, u.email AS user_email, a.lab_id, l.name AS lab_name
           FROM audit_log a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN labs l ON l.id = a.lab_id
          ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY a.id DESC LIMIT ?`,
      )
      .bind(...args, filter.limit ?? 50)
      .all<ActivityRow>()
  ).results;
}

export type StaleUpload = { id: string; folder: string; task_id: string; lab_id: string; lab_name: string; created_at: number; by: string | null };

export async function staleUploads(): Promise<StaleUpload[]> {
  const { db } = await bindings();
  return (
    await db
      .prepare(
        `SELECT up.id, up.folder, up.task_id, up.lab_id, l.name AS lab_name, up.created_at, COALESCE(NULLIF(u.name, ''), u.email) AS by
           FROM uploads up JOIN labs l ON l.id = up.lab_id LEFT JOIN users u ON u.id = up.created_by
          WHERE up.finished_at IS NULL AND up.created_at < ? ORDER BY up.created_at`,
      )
      .bind(Date.now() - STALE_AFTER)
      .all<StaleUpload>()
  ).results;
}

export async function orphanFrames(limit = 900): Promise<{ lab_id: string; hash: string; bytes: number }[]> {
  const { db } = await bindings();
  return (
    await db
      .prepare(`SELECT lf.lab_id, lf.hash, lf.bytes ${ORPHANS} LIMIT ?`)
      .bind(Date.now() - STALE_AFTER, limit)
      .all<{ lab_id: string; hash: string; bytes: number }>()
  ).results;
}

export type ShareRow = {
  id: string;
  token: string;
  title: string;
  scope: "lab" | "tasks";
  tasks: number;
  created_at: number;
  expires_at: number | null;
  revoked_at: number | null;
  views: number;
  last_viewed_at: number | null;
  by: string | null;
};

export async function shareLinks(labId: string): Promise<ShareRow[]> {
  const { db } = await bindings();
  return (
    await db
      .prepare(
        `SELECT s.id, s.token, s.title, s.scope, (SELECT COUNT(*) FROM share_tasks st WHERE st.share_id = s.id) AS tasks,
                s.created_at, s.expires_at, s.revoked_at, s.views, s.last_viewed_at, COALESCE(NULLIF(u.name, ''), u.email) AS by
           FROM share_links s LEFT JOIN users u ON u.id = s.created_by
          WHERE s.lab_id = ? ORDER BY s.revoked_at IS NOT NULL, s.created_at DESC`,
      )
      .bind(labId)
      .all<ShareRow>()
  ).results;
}
