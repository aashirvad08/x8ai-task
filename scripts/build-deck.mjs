// Builds a lab's task data, ready for `npm run seed`, from two sources:
//   - data/index.json and data/runs/*.json: our tasks and recordings (names, in-world clock, world events)
//   - the Stepwise package (default ../stepwise_upload_with_duration): instruction, criteria, blockers, write-ups,
//     failure modes, rewards, per-step trajectories and per-step screenshots
//
// Writes, under data/build/ (never served directly; the app reads it from the database and bucket after seeding):
//   deck.json                 every task with its doc, runs, write-ups and failure modes
//   legacy-steps.json         for old /run/... links: the first step of each recorded turn
//   steps/<task>-<n>.json     one file per run: [{ n, a, t, f, c, r, x }]
//   frames/<hash>.webp        each distinct screenshot once
//
// Usage: node scripts/build-deck.mjs [path-to-stepwise-package]

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(process.argv[2] ?? join(ROOT, "..", "stepwise_upload_with_duration"));
const OUT = join(ROOT, "data/build");
const STEPS_DIR = join(OUT, "steps");
const FRAMES_DIR = join(OUT, "frames");

const BATCH = {
  name: "Computer-use runs",
  description:
    "Five consumer-complaint tasks, each run three times by Fable 5.1 (Claude Code) and three times by Sol (Codex). " +
    "Every task spans weeks of simulated time across email, files and account apps, with obstacles designed in on purpose. " +
    "A run passes only when every graded check holds and no guardrail is broken.",
};
// "checks": a run's criteria achievement is checks met / all checks. "score": the grader's task score.
// These tasks are graded all-or-nothing, so checks met is the more telling number.
const SETTINGS = { criteria: "checks", googleSheetUrl: null };

// Our engine's action kinds and the Stepwise verbs they must line up with, step for step.
const KIND = {
  mouse_click_xy: ["click", "double_click", "triple_click", "right_click", "middle_click"],
  mouse_move_xy: ["mouse_move"],
  mouse_wheel: ["scroll"],
  type: ["type"],
  press_key: ["key"],
  wait_for: ["wait"],
  take_screenshot: ["screenshot"],
  navigate: ["navigate"],
  navigate_back: ["go_back"],
  tabs: ["tabs"],
};

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const readLines = (p) =>
  readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
const verb = (action) => action.split("(")[0].trim();
const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .split("-")
    .slice(0, 6)
    .join("-");

if (!existsSync(SRC)) {
  console.error(`Stepwise package not found at ${SRC}`);
  process.exit(1);
}

const index = readJson(join(ROOT, "data/index.json"));
rmSync(STEPS_DIR, { recursive: true, force: true });
mkdirSync(STEPS_DIR, { recursive: true });
mkdirSync(FRAMES_DIR, { recursive: true });

const framesKept = new Set();
const warnings = [];
const tasks = [];
const legacy = {};

for (const t of index.tasks) {
  const dir = join(SRC, t.key);
  const doc = readJson(join(dir, "viewer/task.json"));
  const notes = readJson(join(dir, "viewer/writeups.json"));
  const instruction = readFileSync(join(dir, "instruction.md"), "utf8").trim();
  const fallbackStatus = notes.review?.status ?? "draft";

  const rolloutDirs = readdirSync(join(dir, "rollouts"))
    .filter((d) => /^rollout\d+$/.test(d))
    .sort((a, b) => Number(a.slice(7)) - Number(b.slice(7)));

  // Our runs, in the order Stepwise numbers them: Fable 1-3, then Sol 1-3.
  const ours = [...t.runs.filter((r) => r.model === "fable"), ...t.runs.filter((r) => r.model === "sol")];
  if (ours.length !== rolloutDirs.length) warnings.push(`${t.key}: ${ours.length} runs here, ${rolloutDirs.length} rollouts in the package`);

  let weights = null;
  const rollouts = rolloutDirs.map((name, k) => {
    const idx = Number(name.slice(7));
    const rdir = join(dir, "rollouts", name);
    const reward = readJson(join(rdir, "reward.txt"));
    const traj = readLines(join(rdir, "traj.jsonl"));
    const run = ours[k];
    weights ??= reward.partial_scores;

    // Our recording, flattened to one entry per action, gives each Stepwise step its in-world clock and result.
    const rec = run ? readJson(join(ROOT, run.file)) : null;
    const flat = [];
    const firstStepOfTurn = [];
    rec?.steps.forEach((s, ti) => {
      firstStepOfTurn[ti] = flat.length + 1;
      for (const a of s.a ?? []) flat.push({ clock: s.t, a });
    });
    let aligned = Boolean(rec) && flat.length === traj.length;
    if (aligned) {
      const off = flat.findIndex((x, i) => !(KIND[x.a.k] ?? [x.a.k]).includes(verb(traj[i].action)));
      if (off >= 0) aligned = false;
    }
    if (rec && !aligned) warnings.push(`${t.key} rollout ${idx}: recording does not line up with the trajectory; clock and world events left out`);

    // Screenshots: one per step, stored once by content. A step keeps its frame only when the screen changed.
    let prev = null;
    const steps = traj.map((s, i) => {
      const n = s["step num"] ?? i + 1;
      const shot = join(rdir, "screenshots", `step_${n}.webp`);
      let f = null;
      if (existsSync(shot)) {
        const buf = readFileSync(shot);
        const hash = createHash("sha1").update(buf).digest("hex").slice(0, 20);
        if (!framesKept.has(hash)) {
          framesKept.add(hash);
          const out = join(FRAMES_DIR, `${hash}.webp`);
          if (!existsSync(out)) copyFileSync(shot, out);
        }
        f = hash === prev ? null : hash;
        prev = hash;
      }
      const step = { n, a: s.action, t: s.thought || undefined, f };
      if (aligned) {
        const x = flat[i];
        step.c = x.clock;
        if (x.a.r) step.r = x.a.r;
        if (x.a.err) step.x = x.a.err;
      }
      return step;
    });
    writeFileSync(join(STEPS_DIR, `${t.key}-${idx}.json`), JSON.stringify(steps));
    // Old links counted turns; a turn without actions points at the next step that has one.
    if (aligned) legacy[`${t.key}-${idx}`] = rec.steps.map((_, ti) => Math.min(steps.length, firstStepOfTurn[ti]));

    // World events from our recording, placed on the first step of the turn where they landed.
    const events = aligned
      ? rec.moments
          .filter((m) => m.i != null)
          .map((m) => {
            let ti = m.i;
            while (ti < rec.steps.length - 1 && !(rec.steps[ti].a ?? []).length) ti++;
            const silent = m.l.startsWith("SILENT ");
            return { step: Math.min(steps.length, firstStepOfTurn[ti] ?? steps.length), label: m.l.replace(/^SILENT /, ""), time: m.t, silent };
          })
      : [];

    const scores = Object.fromEntries(Object.entries(reward.partial_scores).map(([id, v]) => [id, v.score]));
    const all = Object.values(reward.partial_scores);
    const passed = all.filter((v) => v.score >= 1).length;
    const score = reward.score ?? 0;
    return {
      idx,
      model: reward.model,
      run: run?.run ?? null,
      score,
      completed: score >= 1 ? 1 : 0,
      passed,
      total: all.length,
      steps: steps.length,
      durationSec: reward.duration_sec ?? null,
      span: rec ? [rec.steps[0]?.t ?? null, rec.steps.at(-1)?.t ?? null] : null,
      scores,
      hardZero: reward.hard_zero_tripped ?? [],
      events,
    };
  });

  // Weight and objective/guardrail come from reward.txt: weight 0 marks a guardrail.
  const criteria = doc.criteria.map((c) => {
    const w = weights?.[c.id];
    return {
      id: c.id,
      label: c.label,
      explain: c.explain ?? null,
      description: w?.description ?? null,
      weight: w?.weight ?? 0,
      kind: (w?.weight ?? 0) > 0 ? "objective" : "guardrail",
    };
  });

  const visible = (s) => s === "verified" || s === "reviewed";
  const failureModes = (notes.failureModes ?? [])
    .map((f, i) => ({ id: `fm${i + 1}`, status: f.status ?? fallbackStatus, ...f }))
    .filter((f) => visible(f.status));
  const writeups = (notes.rollouts ?? [])
    .map((w) => ({
      rollout: w.rollout,
      status: w.status ?? fallbackStatus,
      title: w.title,
      body: w.body,
      keyMoments: [...(w.keyMoments ?? [])].sort((a, b) => a.step - b.step),
    }))
    .filter((w) => visible(w.status));

  const models = [...new Set(rollouts.map((r) => r.model))];
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  tasks.push({
    id: t.key,
    code: t.version.split(" ")[0],
    slug: `${t.key}-${slugify(t.name)}`,
    name: t.name,
    sourceTraceId: doc.sourceTraceId ?? null,
    headline: doc.headline ?? null,
    domain: doc.domain ?? null,
    principal: t.principal,
    doc: {
      instruction,
      apps: doc.apps ?? [],
      details: doc.details ?? [],
      criteria,
      blockers: doc.blockers ?? [],
    },
    rollouts,
    failureModes,
    writeups,
    stats: {
      rollouts: rollouts.length,
      steps: rollouts.reduce((n, r) => n + r.steps, 0),
      models: models.map((m) => {
        const rs = rollouts.filter((r) => r.model === m);
        return { model: m, n: rs.length, passes: rs.filter((r) => r.completed).length, mean: mean(rs.map((r) => r.score)) };
      }),
    },
  });
}

const models = [...new Set(tasks.flatMap((t) => t.rollouts.map((r) => r.model)))];
writeFileSync(join(OUT, "deck.json"), JSON.stringify({ batch: BATCH, settings: SETTINGS, models, tasks }));
writeFileSync(join(OUT, "legacy-steps.json"), JSON.stringify(legacy));

// Drop frames no run refers to any more.
let removed = 0;
for (const f of readdirSync(FRAMES_DIR)) {
  if (!framesKept.has(f.replace(/\.webp$/, ""))) {
    rmSync(join(FRAMES_DIR, f));
    removed++;
  }
}

for (const w of warnings) console.warn(`warning: ${w}`);
console.log(
  `${tasks.length} tasks, ${tasks.reduce((n, t) => n + t.rollouts.length, 0)} runs, ` +
    `${tasks.reduce((n, t) => n + t.stats.steps, 0)} steps, ${framesKept.size} distinct screenshots` +
    (removed ? ` (${removed} unused removed)` : ""),
);
