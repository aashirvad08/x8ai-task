import { badRequest, labWriter, notFound, openUpload } from "@/lib/server/access";
import { audit, bindings } from "@/lib/server/env";
import { isFrameHash, stepsKey } from "@/lib/server/storage";
import { validateSteps, validateTaskDoc } from "@/lib/server/task-schema";
import { collectFrames, deleteSteps, taskFrames } from "@/lib/server/tasks";

// Finishes an upload: checks the task against the steps and screenshots that arrived, then makes this version the
// task's current one in a single transaction. A new task starts as a draft; a replaced task keeps its status.
export async function POST(request: Request, { params }: { params: Promise<{ lab: string; upload: string }> }) {
  const { lab, upload: uploadId } = await params;
  const auth = await labWriter(request, lab);
  if ("response" in auth) return auth.response;
  const upload = await openUpload(lab, uploadId);
  if (!upload) return notFound();
  const body = (await request.json().catch(() => null)) as { task?: unknown } | null;
  const checked = validateTaskDoc(body?.task);
  if (!checked.ok) return badRequest(`The task couldn't be saved: ${checked.error}.`);
  const doc = { ...checked.doc, slug: upload.folder };

  // Read back every run's steps: their count and screenshots come from what was stored, not from what was claimed.
  const { db, bucket } = await bindings();
  const frames = new Set<string>();
  let bytes = 0;
  for (const run of doc.rollouts) {
    const object = await bucket.get(stepsKey(lab, upload.task_id, upload.id, run.idx));
    if (!object) return badRequest(`Run ${run.idx}'s steps didn't arrive. Upload the task again.`);
    const text = await object.text();
    bytes += text.length;
    const steps = validateSteps(JSON.parse(text), isFrameHash);
    if (!steps.ok) return badRequest(`Run ${run.idx}: ${steps.error}.`);
    run.steps = steps.count;
    for (const f of steps.frames) frames.add(f);
  }
  doc.stats.steps = doc.rollouts.reduce((n, r) => n + r.steps, 0);
  doc.stats.rollouts = doc.rollouts.length;

  const hashes = [...frames];
  const chunks: string[][] = [];
  for (let i = 0; i < hashes.length; i += 90) chunks.push(hashes.slice(i, i + 90));
  let found = 0;
  if (chunks.length) {
    const results = await db.batch(
      chunks.map((c) => db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS b FROM lab_frames WHERE lab_id = ? AND hash IN (${c.map(() => "?").join(",")})`).bind(lab, ...c)),
    );
    for (const r of results) {
      const row = (r.results as { n: number; b: number }[])[0];
      found += row.n;
      bytes += row.b;
    }
  }
  if (found !== hashes.length) return badRequest(`${hashes.length - found} screenshot(s) didn't arrive. Upload the task again.`);

  const previous = upload.replaces
    ? await db.prepare("SELECT version FROM tasks WHERE id = ? AND lab_id = ?").bind(upload.task_id, lab).first<{ version: string }>()
    : null;
  const oldFrames = previous ? await taskFrames(upload.task_id) : [];
  const now = Date.now();
  const data = JSON.stringify(doc);
  const save = previous
    ? db
        .prepare("UPDATE tasks SET code = ?, name = ?, run_count = ?, step_count = ?, bytes = ?, data = ?, version = ?, updated_at = ? WHERE id = ? AND lab_id = ?")
        .bind(doc.code, doc.name, doc.rollouts.length, doc.stats.steps, bytes, data, upload.id, now, upload.task_id, lab)
    : db
        .prepare(
          `INSERT INTO tasks (id, lab_id, folder, code, name, status, position, run_count, step_count, bytes, data, version, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'draft', (SELECT COALESCE(MAX(position), -1) + 1 FROM tasks WHERE lab_id = ?), ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(upload.task_id, lab, upload.folder, doc.code, doc.name, lab, doc.rollouts.length, doc.stats.steps, bytes, data, upload.id, auth.user.id, now, now);
  // 45 rows of two values each stays under D1's 100 bound values per statement.
  const links: D1PreparedStatement[] = [];
  for (let i = 0; i < hashes.length; i += 45) {
    const c = hashes.slice(i, i + 45);
    links.push(db.prepare(`INSERT INTO task_frames (task_id, hash) VALUES ${c.map(() => "(?, ?)").join(", ")}`).bind(...c.flatMap((h) => [upload.task_id, h])));
  }
  try {
    await db.batch([
      save,
      db.prepare("DELETE FROM task_frames WHERE task_id = ?").bind(upload.task_id),
      ...links,
      db.prepare("UPDATE uploads SET finished_at = ? WHERE id = ? AND finished_at IS NULL").bind(now, upload.id),
    ]);
  } catch {
    return Response.json({ error: "This task was being uploaded twice at the same time. Upload it again." }, { status: 409 });
  }

  // The previous version's steps and any screenshots only it used are no longer needed.
  let removed = 0;
  if (previous) {
    await deleteSteps(lab, upload.task_id, previous.version);
    removed = await collectFrames(lab, oldFrames.filter((h) => !frames.has(h)));
  }
  await audit(previous ? "task.replaced" : "task.uploaded", {
    userId: auth.user.id,
    labId: lab,
    detail: { task: upload.task_id, folder: upload.folder, runs: doc.rollouts.length, steps: doc.stats.steps, screenshots: hashes.length, removed },
  });
  const status = await db.prepare("SELECT status FROM tasks WHERE id = ?").bind(upload.task_id).first<{ status: string }>();
  return Response.json({ task: upload.task_id, status: status?.status ?? "draft", replaced: Boolean(previous) });
}
