import { canSeeLab, isAdmin, type SessionUser } from "./auth";
import { bindings } from "./env";
import type { CriteriaMode, LabRef, NavLab, SheetPayload, Task } from "@/lib/types";

// Every read here takes the signed-in user and returns only what that user may see:
// the admin sees every lab, everyone else only their own.

export type TaskRow = { id: string; lab_id: string; lab_slug: string; lab_name: string; folder: string; status: "draft" | "published"; version: string; data: string };
type LabRow = { id: string; slug: string; name: string; description: string; settings: string; status: string };

export const toTask = (r: TaskRow): Task => ({
  ...(JSON.parse(r.data) as Omit<Task, "id" | "lab" | "folder" | "status" | "version">),
  id: r.id,
  lab: { id: r.lab_id, slug: r.lab_slug, name: r.lab_name },
  folder: r.folder,
  status: r.status,
  version: r.version,
});

export const TASK_COLUMNS = "t.id, t.lab_id, l.slug AS lab_slug, l.name AS lab_name, t.folder, t.status, t.version, t.data";

export async function getTask(user: SessionUser, id: string): Promise<Task | null> {
  const { db } = await bindings();
  const row = await db
    .prepare(`SELECT ${TASK_COLUMNS} FROM tasks t JOIN labs l ON l.id = t.lab_id WHERE t.id = ?`)
    .bind(id)
    .first<TaskRow>();
  return row && canSeeLab(user, row.lab_id) ? toTask(row) : null;
}

export async function getLab(user: SessionUser, slug: string) {
  const { db } = await bindings();
  const lab = await db.prepare("SELECT id, slug, name, description, settings, status FROM labs WHERE slug = ?").bind(slug).first<LabRow>();
  return lab && canSeeLab(user, lab.id) ? lab : null;
}

async function labTasks(labId: string): Promise<Task[]> {
  const { db } = await bindings();
  const { results } = await db
    .prepare(`SELECT ${TASK_COLUMNS} FROM tasks t JOIN labs l ON l.id = t.lab_id WHERE t.lab_id = ? ORDER BY t.position, t.created_at`)
    .bind(labId)
    .all<TaskRow>();
  return results.map(toTask);
}

// The sidebar: the user's lab and its tasks, or for the admin every lab.
export async function navFor(user: SessionUser): Promise<NavLab[]> {
  const { db } = await bindings();
  const labs = isAdmin(user)
    ? (await db.prepare("SELECT id, slug, name FROM labs ORDER BY name").all<LabRef>()).results
    : user.lab
      ? [user.lab]
      : [];
  if (!labs.length) return [];
  // The admin's sidebar lists every lab's tasks; everyone else's only their own lab's.
  const query = `SELECT id, lab_id, code, name, status, json_extract(data, '$.rollouts') AS rollouts FROM tasks
    ${isAdmin(user) ? "" : "WHERE lab_id = ?"} ORDER BY position, created_at`;
  const { results } = await (isAdmin(user) ? db.prepare(query) : db.prepare(query).bind(labs[0].id)).all<{
    id: string;
    lab_id: string;
    code: string;
    name: string;
    status: "draft" | "published";
    rollouts: string;
  }>();
  return labs.map((l) => ({
    ...l,
    tasks: results
      .filter((t) => t.lab_id === l.id)
      .map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        status: t.status,
        rollouts: (JSON.parse(t.rollouts) as { idx: number; model: string; score: number }[]).map(({ idx, model, score }) => ({ idx, model, score })),
      })),
  }));
}

// Previous and next tasks within the same lab, for moving between task decks.
export async function neighbours(task: Task) {
  const { db } = await bindings();
  const { results } = await db
    .prepare("SELECT id, name FROM tasks WHERE lab_id = ? ORDER BY position, created_at")
    .bind(task.lab.id)
    .all<{ id: string; name: string }>();
  const i = results.findIndex((t) => t.id === task.id);
  return { index: i, count: results.length, prev: results[i - 1] ?? null, next: results[i + 1] ?? null };
}

// Every page of a task deck, by URL segment.
export function slideKeys(t: Task) {
  return [
    "overview",
    "details",
    "grading",
    ...(t.doc.blockers.length ? ["blockers", ...t.doc.blockers.map((_, i) => `blocker-${i + 1}`)] : []),
    "results",
    ...(t.failureModes.length ? ["failure-modes"] : []),
    "runs",
    ...t.rollouts.map((r) => `run-${r.idx}`),
  ];
}

// The lab's overview and scores sheet.
export async function sheetPayload(lab: LabRow): Promise<SheetPayload> {
  return buildPayload({ id: lab.id, slug: lab.slug, name: lab.name }, lab.name, lab.description, lab.settings, await labTasks(lab.id));
}

// The overview and scores sheet for any set of a lab's tasks: the whole lab, or a share link's tasks.
export function buildPayload(lab: LabRef, title: string, description: string, settingsJson: string, tasks: Task[]): SheetPayload {
  const settings = JSON.parse(settingsJson || "{}") as { criteria?: CriteriaMode; googleSheetUrl?: string };
  const criteria: CriteriaMode = settings.criteria === "score" ? "score" : "checks";
  return {
    lab,
    title,
    description,
    criteria,
    googleSheetUrl: settings.googleSheetUrl ?? null,
    models: [...new Set(tasks.flatMap((t) => t.rollouts.map((r) => r.model)))],
    tasks: tasks.map((t) => ({
      id: t.id,
      status: t.status,
      code: t.code,
      slug: t.slug,
      name: t.name,
      sourceTraceId: t.sourceTraceId,
      domain: t.domain,
      headline: t.headline,
      apps: t.doc.apps.map((a) => a.name),
      instruction: t.doc.instruction,
      blockers: t.doc.blockers.length,
      steps: t.stats.steps,
      runs: t.rollouts.map((r) => ({
        idx: r.idx,
        model: r.model,
        score: r.score,
        passed: r.passed,
        total: r.total,
        achievement: criteria === "checks" ? (r.total ? r.passed / r.total : 0) : r.score,
        completed: r.completed,
        steps: r.steps,
        summary: t.writeups.find((w) => w.rollout === r.idx)?.title ?? null,
      })),
    })),
  };
}

// For links from the first version of the viewer: the first step of each recorded turn in a run.
export async function legacyTurns(user: SessionUser, taskId: string, idx: number): Promise<number[] | null> {
  const { db } = await bindings();
  const row = await db.prepare("SELECT lab_id, legacy FROM tasks WHERE id = ?").bind(taskId).first<{ lab_id: string; legacy: string | null }>();
  if (!row || !canSeeLab(user, row.lab_id) || !row.legacy) return null;
  return (JSON.parse(row.legacy) as Record<string, number[]>)[String(idx)] ?? null;
}
