// Removing task data from the bucket: old versions' steps, and screenshots no task in the lab uses any more.
import { bindings } from "./env";
import { frameKey, stepsPrefix } from "./storage";

// Everything in the bucket under a prefix, a page of up to 1,000 keys at a time. Returns how many were removed.
export async function deletePrefix(prefix: string) {
  const { bucket } = await bindings();
  let removed = 0;
  for (let cursor: string | undefined; ; ) {
    const page = await bucket.list({ prefix, cursor });
    if (page.objects.length) await bucket.delete(page.objects.map((o) => o.key));
    removed += page.objects.length;
    if (!page.truncated) break;
    cursor = page.cursor;
  }
  return removed;
}

export const deleteSteps = (lab: string, task: string, version: string) => deletePrefix(stepsPrefix(lab, task, version));

// Of these screenshots, removes the ones no task in the lab refers to any more.
export async function collectFrames(lab: string, hashes: string[]) {
  if (!hashes.length) return 0;
  const { db, bucket } = await bindings();
  const unused: string[] = [];
  // D1 allows at most 100 bound values per statement.
  for (let i = 0; i < hashes.length; i += 90) {
    const chunk = hashes.slice(i, i + 90);
    const { results } = await db
      .prepare(
        `SELECT lf.hash FROM lab_frames lf
          WHERE lf.lab_id = ? AND lf.hash IN (${chunk.map(() => "?").join(",")})
            AND NOT EXISTS (SELECT 1 FROM task_frames tf JOIN tasks t ON t.id = tf.task_id WHERE tf.hash = lf.hash AND t.lab_id = lf.lab_id)`,
      )
      .bind(lab, ...chunk)
      .all<{ hash: string }>();
    unused.push(...results.map((r) => r.hash));
  }
  for (let i = 0; i < unused.length; i += 90) {
    const chunk = unused.slice(i, i + 90);
    await bucket.delete(chunk.map((h) => frameKey(lab, h)));
    await db.prepare(`DELETE FROM lab_frames WHERE lab_id = ? AND hash IN (${chunk.map(() => "?").join(",")})`).bind(lab, ...chunk).run();
  }
  return unused.length;
}

export async function taskFrames(task: string) {
  const { db } = await bindings();
  const { results } = await db.prepare("SELECT hash FROM task_frames WHERE task_id = ?").bind(task).all<{ hash: string }>();
  return results.map((r) => r.hash);
}
