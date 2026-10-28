// Share links: what someone holding /v/<token> may see. Only published tasks in the link's scope, from a lab whose
// access isn't paused, while the link is neither revoked nor expired. Everything else is "not found".
import { cache } from "react";
import { bindings } from "./env";
import { buildPayload, TASK_COLUMNS, toTask, type TaskRow } from "./data";
import type { SheetPayload, Task } from "@/lib/types";

export type Share = {
  id: string;
  token: string;
  title: string;
  description: string;
  scope: "lab" | "tasks";
  lab: { id: string; slug: string; name: string; settings: string };
};

type ShareRow = {
  id: string;
  token: string;
  title: string;
  description: string;
  scope: "lab" | "tasks";
  lab_id: string;
  lab_slug: string;
  lab_name: string;
  lab_settings: string;
};

export const isShareToken = (s: string) => /^[A-Za-z0-9_-]{20,64}$/.test(s);

export const getShare = cache(async (token: string): Promise<Share | null> => {
  if (!isShareToken(token)) return null;
  const { db } = await bindings();
  const row = await db
    .prepare(
      `SELECT s.id, s.token, s.title, s.description, s.scope, l.id AS lab_id, l.slug AS lab_slug, l.name AS lab_name, l.settings AS lab_settings
         FROM share_links s JOIN labs l ON l.id = s.lab_id
        WHERE s.token = ? AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > ?) AND l.status = 'active'`,
    )
    .bind(token, Date.now())
    .first<ShareRow>();
  if (!row) return null;
  return {
    id: row.id,
    token: row.token,
    title: row.title,
    description: row.description,
    scope: row.scope,
    lab: { id: row.lab_id, slug: row.lab_slug, name: row.lab_name, settings: row.lab_settings },
  };
});

// The tasks the link shows, in order: the link's own order for chosen tasks, the lab's order otherwise.
const SCOPED = `FROM tasks t JOIN labs l ON l.id = t.lab_id
  LEFT JOIN share_tasks st ON st.task_id = t.id AND st.share_id = ?2
  WHERE t.lab_id = ?1 AND t.status = 'published' AND (?3 = 'lab' OR st.task_id IS NOT NULL)`;

export const shareTasks = cache(async (share: Share): Promise<Task[]> => {
  const { db } = await bindings();
  const { results } = await db
    .prepare(`SELECT ${TASK_COLUMNS} ${SCOPED} ORDER BY COALESCE(st.position, t.position), t.created_at`)
    .bind(share.lab.id, share.id, share.scope)
    .all<TaskRow>();
  return results.map(toTask);
});

export async function shareTask(share: Share, taskId: string): Promise<Task | null> {
  return (await shareTasks(share)).find((t) => t.id === taskId) ?? null;
}

export async function shareNeighbours(share: Share, task: Task) {
  const tasks = await shareTasks(share);
  const i = tasks.findIndex((t) => t.id === task.id);
  const brief = (t?: Task) => (t ? { id: t.id, name: t.name } : null);
  return { index: i, count: tasks.length, prev: brief(tasks[i - 1]), next: brief(tasks[i + 1]) };
}

export async function sharePayload(share: Share): Promise<SheetPayload> {
  return buildPayload({ id: share.lab.id, slug: share.lab.slug, name: share.lab.name }, share.title, share.description, share.lab.settings, await shareTasks(share));
}

// A screenshot is visible through the link only if a task in the link's scope uses it.
export async function shareHasFrame(share: Share, hash: string) {
  const { db } = await bindings();
  return Boolean(
    await db
      .prepare(`SELECT 1 FROM task_frames tf JOIN tasks t ON t.id = tf.task_id LEFT JOIN share_tasks st ON st.task_id = t.id AND st.share_id = ?2
                 WHERE tf.hash = ?4 AND t.lab_id = ?1 AND t.status = 'published' AND (?3 = 'lab' OR st.task_id IS NOT NULL) LIMIT 1`)
      .bind(share.lab.id, share.id, share.scope, hash)
      .first(),
  );
}

export async function recordView(share: Share) {
  const { db } = await bindings();
  await db.prepare("UPDATE share_links SET views = views + 1, last_viewed_at = ? WHERE id = ?").bind(Date.now(), share.id).run();
}
