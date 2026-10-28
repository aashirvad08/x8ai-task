// Loads data/build/ (from `npm run build:data`) into the local database and bucket as one lab's tasks.
// Safe to re-run: tasks are updated in place and files already in the bucket are skipped.
//
// Usage: node scripts/seed-local.mjs [--lab-slug msl] [--lab-name "MSL"]
// Needs the local database to exist first: `npm run db:migrate`.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(ROOT, "data/build");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const LAB_SLUG = arg("lab-slug", "msl");
const LAB_NAME = arg("lab-name", "MSL");

if (!existsSync(join(BUILD, "deck.json"))) {
  console.error("data/build/deck.json is missing. Run `npm run build:data` first.");
  process.exit(1);
}
const deck = JSON.parse(readFileSync(join(BUILD, "deck.json"), "utf8"));
const legacy = JSON.parse(readFileSync(join(BUILD, "legacy-steps.json"), "utf8"));
const newId = (prefix) => `${prefix}_${randomBytes(12).toString("base64url")}`;

const { env, dispose } = await getPlatformProxy({ configPath: join(ROOT, "wrangler.jsonc"), persist: true });
const db = env.DB;
const bucket = env.BUCKET;

try {
  const hasSchema = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'").first();
  if (!hasSchema) throw new Error("The local database has no tables yet. Run `npm run db:migrate` first.");

  const now = Date.now();
  let lab = await db.prepare("SELECT id, name FROM labs WHERE slug = ?").bind(LAB_SLUG).first();
  if (!lab) {
    lab = { id: newId("lab"), name: LAB_NAME };
    await db
      .prepare("INSERT INTO labs (id, slug, name, description, settings, status, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?)")
      .bind(lab.id, LAB_SLUG, LAB_NAME, deck.batch.description, JSON.stringify(deck.settings), now)
      .run();
    console.log(`Created lab ${LAB_NAME} (/labs/${LAB_SLUG}).`);
  } else {
    console.log(`Using existing lab ${lab.name} (/labs/${LAB_SLUG}).`);
  }

  // Upload with a few requests in flight at once.
  async function pool(items, limit, fn) {
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) await fn(items[next++]);
      }),
    );
  }

  const frameSize = (hash) => statSync(join(BUILD, "frames", `${hash}.webp`)).size;
  const allFrames = new Set();
  let uploaded = 0;

  for (const [position, task] of deck.tasks.entries()) {
    const owner = await db.prepare("SELECT lab_id FROM tasks WHERE id = ?").bind(task.id).first();
    if (owner && owner.lab_id !== lab.id) throw new Error(`Task id ${task.id} already belongs to another lab.`);

    // Each seed is a new version of the task: its steps go under a fresh prefix, and the previous version's are removed below.
    const version = `seed-${now.toString(36)}`;
    const previous = owner ? (await db.prepare("SELECT version FROM tasks WHERE id = ?").bind(task.id).first())?.version : null;
    const frames = new Set();
    let bytes = 0;
    for (const r of task.rollouts) {
      const file = join(BUILD, "steps", `${task.id}-${r.idx}.json`);
      const body = readFileSync(file);
      bytes += body.length;
      for (const s of JSON.parse(body)) if (s.f) frames.add(s.f);
      await bucket.put(`labs/${lab.id}/tasks/${task.id}/${version}/steps/${r.idx}.json`, body, { httpMetadata: { contentType: "application/json" } });
    }
    for (const f of frames) {
      bytes += frameSize(f);
      allFrames.add(f);
    }

    const turns = Object.fromEntries(task.rollouts.filter((r) => legacy[`${task.id}-${r.idx}`]).map((r) => [r.idx, legacy[`${task.id}-${r.idx}`]]));
    const { id, ...data } = task;
    await db.batch([
      db
        .prepare(
          `INSERT INTO tasks (id, lab_id, folder, code, name, status, position, run_count, step_count, bytes, data, legacy, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET code = excluded.code, name = excluded.name, position = excluded.position,
             run_count = excluded.run_count, step_count = excluded.step_count, bytes = excluded.bytes,
             data = excluded.data, legacy = excluded.legacy, version = excluded.version, updated_at = excluded.updated_at`,
        )
        .bind(id, lab.id, id, task.code, task.name, position, task.rollouts.length, task.stats.steps, bytes, JSON.stringify(data), JSON.stringify(turns), version, now, now),
      db.prepare("DELETE FROM task_frames WHERE task_id = ?").bind(id),
      ...[...frames].map((h) => db.prepare("INSERT INTO task_frames (task_id, hash) VALUES (?, ?)").bind(id, h)),
    ]);
    // Steps from earlier layouts or versions of this task.
    for (const prefix of [`labs/${lab.id}/tasks/${task.id}/steps/`, previous && previous !== version ? `labs/${lab.id}/tasks/${task.id}/${previous}/steps/` : null]) {
      if (!prefix) continue;
      const old = await bucket.list({ prefix });
      if (old.objects.length) await bucket.delete(old.objects.map((o) => o.key));
    }
    console.log(`  ${task.code} ${task.name}: ${task.rollouts.length} runs, ${task.stats.steps} steps, ${frames.size} screenshots`);
  }

  // Screenshots: each stored once per lab, named by content.
  const list = [...allFrames];
  await pool(list, 16, async (hash) => {
    const key = `labs/${lab.id}/frames/${hash}.webp`;
    if (!(await bucket.head(key))) {
      await bucket.put(key, readFileSync(join(BUILD, "frames", `${hash}.webp`)), { httpMetadata: { contentType: "image/webp" } });
      if (++uploaded % 500 === 0) console.log(`  ${uploaded} screenshots uploaded…`);
    }
    await db
      .prepare("INSERT OR IGNORE INTO lab_frames (lab_id, hash, bytes, created_at) VALUES (?, ?, ?, ?)")
      .bind(lab.id, hash, frameSize(hash), now)
      .run();
  });

  await db
    .prepare("INSERT INTO audit_log (at, user_id, lab_id, action, detail) VALUES (?, NULL, ?, 'seed.imported', ?)")
    .bind(Date.now(), lab.id, JSON.stringify({ tasks: deck.tasks.length, screenshots: list.length, uploaded }))
    .run();
  console.log(`Done: ${deck.tasks.length} tasks in ${LAB_NAME}; ${list.length} screenshots (${uploaded} newly uploaded).`);
} finally {
  await dispose();
}
