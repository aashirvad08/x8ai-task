// Reads a task package, checks it against the format the packaging prompt describes, and builds what the app stores.
// The same rules are in public/tools/check_package.py, which labs run before uploading.
import type { PkgFile } from "./files";
import type { Criterion, FailureMode, KeyMoment, Modality, ReviewStatus, Rollout, Step, Task, Writeup } from "@/lib/types";

export const LIMITS = {
  screenshotBytes: 8 * 1024 * 1024,
  observationChars: 20_000,
  stepsPerRun: 20_000,
  runsPerTask: 60,
  traceLineChars: 1_000_000,
};

const REF = /\[\[(?:r(\d+):)?(\d+)(?:\s*[-–]\s*(\d+))?\]\]/gi;
const SHOT = /^step_(\d+)\.(png|webp|jpe?g)$/i;
const KINDS = new Set(["hidden-evidence", "timing-window", "irreversible-action", "restraint", "privacy-boundary", "decoy", "gated-process", "derived-answer"]);
const STATUSES = new Set(["draft", "verified", "reviewed"]);
const MODALITIES = new Set(["gui", "terminal", "tool"]);

type Json = Record<string, unknown>;
type RunPlan = { idx: number; folder: string; trace: PkgFile; reward: PkgFile | null; shots: Map<number, PkgFile> };

export type RunSummary = { idx: number; model: string | null; steps: number; screenshots: number; observations: number };
export type TaskReport = {
  folder: string;
  name: string;
  modality: Modality;
  errors: string[];
  warnings: string[];
  runs: RunSummary[];
  writeups: number;
  failureModes: number;
  hidden: number;
};
export type PlannedTask = { report: TaskReport; build: (onProgress?: (done: number, total: number) => void) => Promise<BuiltTask> };
export type BuiltTask = {
  folder: string;
  task: Omit<Task, "id" | "lab" | "folder" | "status" | "version">;
  runs: { idx: number; steps: Step[] }[];
  frames: Map<string, { size: number; bytes: () => Promise<Uint8Array> }>;
};

const parse = (text: string): unknown => JSON.parse(text);
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");

// The INSTRUCTION = "..." (or a triple-quoted string) defined at the top level of a task.py.
function instructionFromPython(src: string) {
  const triple = /^INSTRUCTION\s*=\s*(?:[rRuU]?)("""|''')([\s\S]*?)\1/m.exec(src);
  if (triple) return triple[2].trim();
  const single = /^INSTRUCTION\s*=\s*(?:[rRuU]?)(["'])((?:\\.|(?!\1).)*)\1/m.exec(src);
  if (single) {
    try {
      return JSON.parse(`"${single[2].replace(/"/g, '\\"').replace(/\\'/g, "'")}"`) as string;
    } catch {
      return single[2];
    }
  }
  return null;
}

async function readJson(file: PkgFile | undefined, where: string, errors: string[]): Promise<Json | null> {
  if (!file) return null;
  try {
    const v = parse(await file.text());
    if (!isObj(v)) throw new Error("expected an object");
    return v;
  } catch (e) {
    errors.push(`${where}: not valid JSON (${(e as Error).message})`);
    return null;
  }
}

// Finds every task in the package: a folder with rollouts/<run>/traj.jsonl.
export async function inspectPackage(files: PkgFile[]): Promise<{ tasks: PlannedTask[]; problems: string[] }> {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const roots = new Set<string>();
  for (const f of files) {
    const m = /^(.*?)(?:^|\/)rollouts\/[^/]+\/traj\.jsonl$/.exec(f.path);
    if (m) roots.add(m[1]);
  }
  if (!roots.size) return { tasks: [], problems: ["No tasks found. Each task needs <task-folder>/rollouts/<run>/traj.jsonl."] };
  const tasks: PlannedTask[] = [];
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const root of [...roots].sort()) {
    const folder = root.split("/").filter(Boolean).pop() ?? "task";
    if (seen.has(folder)) problems.push(`Two tasks are named ${folder}; task folder names must be unique in a package.`);
    seen.add(folder);
    const under = (rel: string) => byPath.get(root ? `${root}/${rel}` : rel);
    const prefix = root ? `${root}/` : "";
    tasks.push(await inspectTask(folder, prefix, files.filter((f) => f.path.startsWith(prefix)), under));
  }
  return { tasks, problems };
}

async function inspectTask(folder: string, prefix: string, files: PkgFile[], under: (rel: string) => PkgFile | undefined): Promise<PlannedTask> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const T = folder;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(folder)) warnings.push(`${T}: use lowercase letters, digits and hyphens in task folder names`);

  const vt = (await readJson(under("viewer/task.json"), `${T}/viewer/task.json`, errors)) ?? {};
  let instruction = str(vt.instruction).trim();
  if (!instruction && under("instruction.md")) instruction = (await (under("instruction.md") as PkgFile).text()).trim();
  const py = under("reward_setup_script/task.py") ?? under("task.py");
  if (!instruction && py) {
    instruction = instructionFromPython(await py.text()) ?? "";
    if (!instruction) errors.push(`${T}: couldn't read a top-level INSTRUCTION string from task.py; add instruction.md instead`);
  }
  if (!instruction) errors.push(`${T}: no instruction (instruction.md)`);

  // Runs: rollouts/<name ending in a number>/
  const plans = new Map<number, RunPlan>();
  for (const f of files) {
    const m = new RegExp(`^${escape(prefix)}rollouts/([^/]+)/(.+)$`).exec(f.path);
    if (!m) continue;
    const [, runFolder, rest] = m;
    const num = /(\d+)$/.exec(runFolder);
    if (!num) {
      if (rest === "traj.jsonl") errors.push(`${T}/${runFolder}: run folder names must end in a number (rollout1, rollout2, …)`);
      continue;
    }
    const idx = Number(num[1]);
    let plan = plans.get(idx);
    if (plan && plan.folder !== runFolder) {
      if (rest === "traj.jsonl") errors.push(`${T}: two run folders end in ${idx}`);
      continue;
    }
    if (!plan) plans.set(idx, (plan = { idx, folder: runFolder, trace: undefined as unknown as PkgFile, reward: null, shots: new Map() }));
    if (rest === "traj.jsonl") plan.trace = f;
    else if (rest === "reward.txt" || (rest === "reward.json" && !plan.reward)) plan.reward = f;
    else if (rest.startsWith("screenshots/")) {
      const name = rest.slice("screenshots/".length);
      const s = SHOT.exec(name);
      if (!s) warnings.push(`${T}/rollouts/${runFolder}/screenshots/${name}: not named step_N.png|webp|jpg, ignored`);
      else {
        plan.shots.set(Number(s[1]), f);
        if (f.size > LIMITS.screenshotBytes) errors.push(`${T}/rollouts/${runFolder}/screenshots/${name}: over 8 MB`);
      }
    }
  }
  const runs = [...plans.values()].filter((p) => p.trace).sort((a, b) => a.idx - b.idx);
  if (runs.length > LIMITS.runsPerTask) errors.push(`${T}: ${runs.length} runs; the limit is ${LIMITS.runsPerTask} per task`);

  const stepsOf = new Map<number, Set<number>>();
  const traces = new Map<number, { n: number; a: string; t: string; o?: string }[]>();
  const rewards = new Map<number, Json>();
  const summaries: RunSummary[] = [];
  let checks: Set<string> | null = null;
  let observationsSeen = 0;

  for (const run of runs) {
    const where = `${T}/rollouts/${run.folder}`;
    const lines = (await run.trace.text()).split(/\r?\n/);
    const steps: { n: number; a: string; t: string; o?: string }[] = [];
    let observations = 0;
    lines.forEach((line, i) => {
      if (!line.trim()) return;
      if (line.length > LIMITS.traceLineChars) return errors.push(`${where}/traj.jsonl line ${i + 1}: longer than 1 MB`);
      let d: unknown;
      try {
        d = parse(line);
      } catch {
        return errors.push(`${where}/traj.jsonl line ${i + 1}: not JSON`);
      }
      if (!isObj(d) || !Number.isInteger(d["step num"])) return errors.push(`${where}/traj.jsonl line ${i + 1}: "step num" must be an integer`);
      const n = d["step num"] as number;
      if (typeof d.action !== "string" || !/^\s*[A-Za-z_][\w.-]*\s*\([\s\S]*\)\s*$/.test(d.action)) warnings.push(`${where} step ${n}: action should look like name({...})`);
      if (d.thought !== undefined && typeof d.thought !== "string") errors.push(`${where} step ${n}: "thought" must be a string`);
      if (d.observation !== undefined && typeof d.observation !== "string") errors.push(`${where} step ${n}: "observation" must be a string`);
      let o = typeof d.observation === "string" && d.observation ? d.observation : undefined;
      if (o) {
        observations++;
        if (o.length > LIMITS.observationChars) o = `${o.slice(0, LIMITS.observationChars)}\n… (${o.length - LIMITS.observationChars} more characters not shown)`;
      }
      steps.push({ n, a: typeof d.action === "string" ? d.action : String(d.action ?? ""), t: str(d.thought), o });
    });
    if (steps.some((s, i) => s.n !== i + 1)) errors.push(`${where}: "step num" must run 1, 2, 3, … with no gaps or repeats`);
    if (steps.length > LIMITS.stepsPerRun) errors.push(`${where}: ${steps.length} steps; the limit is ${LIMITS.stepsPerRun} per run`);
    if (!steps.length) errors.push(`${where}/traj.jsonl: no steps`);
    stepsOf.set(run.idx, new Set(steps.map((s) => s.n)));
    traces.set(run.idx, steps);
    observationsSeen += observations;
    const extra = [...run.shots.keys()].filter((n) => !stepsOf.get(run.idx)?.has(n)).sort((a, b) => a - b);
    if (extra.length) warnings.push(`${where}: screenshots for steps not in traj.jsonl, e.g. ${extra.slice(0, 5).join(", ")}`);

    let model: string | null = null;
    if (!run.reward) errors.push(`${where}: missing reward.txt`);
    else {
      const rw = (await readJson(run.reward, `${where}/reward.txt`, errors)) ?? {};
      rewards.set(run.idx, rw);
      model = typeof rw.model === "string" && rw.model ? rw.model : null;
      if (!model) errors.push(`${where}/reward.txt: needs "model"`);
      if (typeof rw.score !== "number" || rw.score < 0 || rw.score > 1) errors.push(`${where}/reward.txt: "score" must be a number from 0 to 1`);
      const ps = rw.partial_scores;
      if (!isObj(ps) || !Object.keys(ps).length) errors.push(`${where}/reward.txt: needs "partial_scores" with every graded check`);
      else {
        for (const [k, v] of Object.entries(ps))
          if (!isObj(v) || typeof v.score !== "number" || typeof v.weight !== "number")
            errors.push(`${where}/reward.txt: check "${k}" needs numeric "score" and "weight"`);
        const ids = new Set(Object.keys(ps));
        if (!checks) checks = ids;
        else if (ids.size !== checks.size || [...ids].some((k) => !checks?.has(k))) {
          const diff = [...ids].filter((k) => !checks?.has(k)).concat([...checks].filter((k) => !ids.has(k)));
          errors.push(`${where}/reward.txt: checks differ from other runs: ${diff.slice(0, 6).join(", ")}`);
        }
        for (const h of Array.isArray(rw.hard_zero_tripped) ? rw.hard_zero_tripped : [])
          if (!(String(h) in ps)) errors.push(`${where}/reward.txt: hard_zero_tripped names unknown check "${h}"`);
      }
    }
    summaries.push({ idx: run.idx, model, steps: steps.length, screenshots: run.shots.size, observations });
  }
  const checkIds: Set<string> = checks ?? new Set<string>();

  // Modality: stated in task.json, or inferred from what the runs recorded.
  let modality: Modality;
  if (vt.modality !== undefined) {
    if (!MODALITIES.has(String(vt.modality))) errors.push(`${T}/viewer/task.json: "modality" must be gui, terminal or tool`);
    modality = (MODALITIES.has(String(vt.modality)) ? vt.modality : "gui") as Modality;
  } else modality = runs.some((r) => r.shots.size) || !observationsSeen ? "gui" : "terminal";
  if (modality === "gui")
    for (const run of runs) {
      const missing = [...(stepsOf.get(run.idx) ?? [])].filter((n) => !run.shots.has(n));
      if (missing.length) warnings.push(`${T}/rollouts/${run.folder}: ${missing.length} step(s) without a screenshot, e.g. ${missing.slice(0, 5).join(", ")}`);
    }
  else if (!observationsSeen) warnings.push(`${T}: a ${modality} task with no "observation" on any step; the player will have no output to show`);

  // viewer/task.json
  const runIds = new Set(runs.map((r) => r.idx));
  const criteriaIn = Array.isArray(vt.criteria) ? (vt.criteria as Json[]) : [];
  const blockersIn = Array.isArray(vt.blockers) ? (vt.blockers as Json[]) : [];
  if (!Object.keys(vt).length) warnings.push(`${T}: no viewer/task.json; the deck will show only the instruction, grading and runs`);
  else {
    for (const k of ["name", "headline"]) if (!vt[k]) warnings.push(`${T}/viewer/task.json: missing "${k}"`);
    const labelled = new Set(criteriaIn.map((c) => str(c.id)));
    for (const c of labelled) if (!checkIds.has(c)) errors.push(`${T}/viewer/task.json: criteria id "${c}" is not a check in reward.txt`);
    for (const c of checkIds) if (!labelled.has(c)) warnings.push(`${T}/viewer/task.json: check "${c}" has no label`);
    for (const b of blockersIn) {
      const bid = str(b.id) || "?";
      for (const f of ["id", "title", "kind", "origin", "whatAgentSees", "whyHard", "rightPath", "wrongMove", "criteria", "caught"])
        if (!(f in b)) errors.push(`${T}/viewer/task.json: blocker ${bid} is missing "${f}"`);
      if (!KINDS.has(str(b.kind))) warnings.push(`${T}/viewer/task.json: blocker ${bid} kind "${str(b.kind)}" is not a standard kind`);
      if (b.origin !== "source-trace" && b.origin !== "added-in-task") errors.push(`${T}/viewer/task.json: blocker ${bid} origin must be source-trace or added-in-task`);
      for (const c of Array.isArray(b.criteria) ? b.criteria : []) if (!checkIds.has(String(c))) errors.push(`${T}/viewer/task.json: blocker ${bid} guards unknown check "${c}"`);
      for (const r of Array.isArray(b.caught) ? b.caught : []) if (!runIds.has(Number(r))) errors.push(`${T}/viewer/task.json: blocker ${bid} caught run ${r}, which doesn't exist`);
    }
  }

  // viewer/writeups.json
  const w = (await readJson(under("viewer/writeups.json"), `${T}/viewer/writeups.json`, errors)) ?? null;
  if (!w && !under("viewer/writeups.json")) warnings.push(`${T}: no viewer/writeups.json`);
  const fallback = w && isObj(w.review) ? (w.review.status as string | undefined) : undefined;
  if (fallback !== undefined && !STATUSES.has(fallback)) errors.push(`${T}/viewer/writeups.json: review.status must be draft or verified`);
  const checkRefs = (text: unknown, where: string, def?: number) => {
    for (const m of str(text).matchAll(REF)) {
      const r = m[1] ? Number(m[1]) : def;
      if (r === undefined) {
        errors.push(`${where}: ${m[0]} needs a run number, e.g. [[r4:${m[2]}]]`);
        continue;
      }
      if (!stepsOf.has(r)) {
        errors.push(`${where}: ${m[0]} refers to run ${r}, which doesn't exist`);
        continue;
      }
      for (const s of new Set([Number(m[2]), Number(m[3] ?? m[2])])) if (!stepsOf.get(r)?.has(s)) errors.push(`${where}: ${m[0]}: run ${r} has no step ${s}`);
    }
  };
  const failuresIn = w && Array.isArray(w.failureModes) ? (w.failureModes as Json[]) : [];
  const writeupsIn = w && Array.isArray(w.rollouts) ? (w.rollouts as Json[]) : [];
  let hidden = 0;
  failuresIn.forEach((f, i) => {
    const where = `${T} failure mode ${i + 1}`;
    for (const k of ["title", "summary", "rollouts", "criteria", "attribution", "severity"]) if (!(k in f)) errors.push(`${where}: missing "${k}"`);
    checkRefs(f.summary, where);
    for (const r of Array.isArray(f.rollouts) ? f.rollouts : []) if (!runIds.has(Number(r))) errors.push(`${where}: run ${r} doesn't exist`);
    for (const c of Array.isArray(f.criteria) ? f.criteria : []) if (!checkIds.has(String(c))) errors.push(`${where}: unknown check "${c}"`);
    if (!["model", "environment", "mixed"].includes(str(f.attribution))) errors.push(`${where}: attribution must be model, environment or mixed`);
    if (!["critical", "major", "minor"].includes(str(f.severity))) errors.push(`${where}: severity must be critical, major or minor`);
    if ((str(f.status) || fallback || "draft") === "draft") hidden++;
  });
  const written = new Set<number>();
  for (const r of writeupsIn) {
    const n = Number(r.rollout);
    const where = `${T} write-up for run ${r.rollout}`;
    if (!runIds.has(n)) {
      errors.push(`${where}: no such run`);
      continue;
    }
    if (written.has(n)) errors.push(`${where}: written twice`);
    written.add(n);
    for (const k of ["title", "body", "keyMoments"]) if (!r[k]) errors.push(`${where}: missing "${k}"`);
    checkRefs(r.body, where, n);
    for (const km of Array.isArray(r.keyMoments) ? (r.keyMoments as Json[]) : []) {
      if (!stepsOf.get(n)?.has(Number(km.step))) errors.push(`${where}: key moment step ${km.step} doesn't exist`);
      if (!["good", "bad", "neutral"].includes(str(km.tone))) errors.push(`${where}: key moment tone must be good, bad or neutral`);
    }
    if ((str(r.status) || fallback || "draft") === "draft") hidden++;
  }
  for (const r of runs) if (!written.has(r.idx) && w) warnings.push(`${T}: run ${r.idx} has no write-up`);
  if (hidden) warnings.push(`${T}: ${hidden} write-up(s) are drafts and will be hidden`);

  const report: TaskReport = {
    folder,
    name: str(vt.name) || folder,
    modality,
    errors,
    warnings,
    runs: summaries,
    writeups: written.size,
    failureModes: failuresIn.length,
    hidden,
  };

  // Building reads every screenshot to name it by content; it runs only when the package is uploaded.
  const build = async (onProgress?: (done: number, total: number) => void): Promise<BuiltTask> => {
    const frames: BuiltTask["frames"] = new Map();
    const builtRuns: BuiltTask["runs"] = [];
    const total = runs.reduce((n, r) => n + r.shots.size, 0);
    let done = 0;
    for (const run of runs) {
      let prev: string | null = null;
      const steps: Step[] = [];
      for (const s of traces.get(run.idx) ?? []) {
        const shot = run.shots.get(s.n);
        let f: string | null = null;
        if (shot) {
          const bytes = await shot.bytes();
          const hash = await sha1(bytes);
          if (!frames.has(hash)) frames.set(hash, { size: bytes.length, bytes: shot.bytes });
          f = hash === prev ? null : hash;
          prev = hash;
          onProgress?.(++done, total);
        }
        steps.push({ n: s.n, a: s.a, ...(s.t ? { t: s.t } : {}), ...(s.o ? { o: s.o } : {}), f });
      }
      builtRuns.push({ idx: run.idx, steps });
    }
    return { folder, task: assemble(folder, vt, instruction, modality, runs, rewards, builtRuns, criteriaIn, blockersIn, failuresIn, writeupsIn, fallback), runs: builtRuns, frames };
  };
  return { report, build };
}

function assemble(
  folder: string,
  vt: Json,
  instruction: string,
  modality: Modality,
  runs: RunPlan[],
  rewards: Map<number, Json>,
  built: BuiltTask["runs"],
  criteriaIn: Json[],
  blockersIn: Json[],
  failuresIn: Json[],
  writeupsIn: Json[],
  fallback: string | undefined,
): BuiltTask["task"] {
  const weights = (rewards.get(runs[0]?.idx ?? -1)?.partial_scores ?? {}) as Record<string, Json>;
  const labels = new Map(criteriaIn.map((c) => [str(c.id), c]));
  const criteria: Criterion[] = Object.keys(weights).map((id) => {
    const w = weights[id] ?? {};
    const c = labels.get(id) ?? {};
    const weight = typeof w.weight === "number" ? w.weight : 0;
    return { id, label: str(c.label) || id, explain: str(c.explain) || null, description: str(w.description) || null, weight, kind: weight > 0 ? "objective" : "guardrail" };
  });
  const rollouts: Rollout[] = runs.map((run) => {
    const rw = rewards.get(run.idx) ?? {};
    const ps = (isObj(rw.partial_scores) ? rw.partial_scores : {}) as Record<string, Json>;
    const all = Object.values(ps);
    const score = typeof rw.score === "number" ? rw.score : 0;
    return {
      idx: run.idx,
      model: str(rw.model) || "unknown model",
      run: null,
      score,
      completed: score >= 1 ? 1 : 0,
      passed: all.filter((v) => typeof v.score === "number" && v.score >= 1).length,
      total: all.length,
      steps: built.find((b) => b.idx === run.idx)?.steps.length ?? 0,
      durationSec: typeof rw.duration_sec === "number" ? rw.duration_sec : null,
      span: null,
      scores: Object.fromEntries(Object.entries(ps).map(([k, v]) => [k, typeof v.score === "number" ? v.score : 0])),
      hardZero: Array.isArray(rw.hard_zero_tripped) ? rw.hard_zero_tripped.map(String) : [],
      events: [],
    };
  });
  const visible = (s: string) => s === "verified" || s === "reviewed";
  const failureModes: FailureMode[] = failuresIn
    .map((f, i) => ({
      id: `fm${i + 1}`,
      status: (str(f.status) || fallback || "draft") as ReviewStatus,
      title: str(f.title),
      summary: str(f.summary),
      rollouts: (Array.isArray(f.rollouts) ? f.rollouts : []).map(Number),
      criteria: (Array.isArray(f.criteria) ? f.criteria : []).map(String),
      attribution: str(f.attribution),
      severity: str(f.severity),
    }))
    .filter((f) => visible(f.status));
  const writeups: Writeup[] = writeupsIn
    .map((w) => ({
      rollout: Number(w.rollout),
      status: (str(w.status) || fallback || "draft") as ReviewStatus,
      title: str(w.title),
      body: str(w.body),
      keyMoments: (Array.isArray(w.keyMoments) ? (w.keyMoments as Json[]) : [])
        .map((k) => ({ step: Number(k.step), label: str(k.label), tone: (["good", "bad", "neutral"].includes(str(k.tone)) ? k.tone : "neutral") as KeyMoment["tone"] }))
        .sort((a, b) => a.step - b.step),
    }))
    .filter((w) => visible(w.status));
  const traceId = str(vt.sourceTraceId) || (/(?:^|-)(r\d+)(?:-|$)/i.exec(folder)?.[1]?.toUpperCase() ?? null);
  const code = traceId ?? (/(?:^|-)([a-z]{1,4}\d{2,})(?:-|$)/i.exec(folder)?.[1] ?? folder.slice(0, 10)).toUpperCase();
  const models = [...new Set(rollouts.map((r) => r.model))];
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    code,
    slug: folder,
    name: str(vt.name) || folder,
    sourceTraceId: traceId,
    headline: str(vt.headline) || null,
    domain: str(vt.domain) || null,
    principal: "",
    modality,
    doc: {
      instruction,
      apps: (Array.isArray(vt.apps) ? (vt.apps as Json[]) : []).map((a) => ({ name: str(a.name), role: str(a.role) })).filter((a) => a.name),
      details: (Array.isArray(vt.details) ? (vt.details as Json[]) : []).map((d) => ({ title: str(d.title), body: str(d.body) })).filter((d) => d.title),
      criteria,
      blockers: blockersIn.map((b) => ({
        id: str(b.id),
        title: str(b.title),
        kind: str(b.kind),
        origin: str(b.origin),
        whatAgentSees: str(b.whatAgentSees),
        whyHard: str(b.whyHard),
        rightPath: str(b.rightPath),
        wrongMove: str(b.wrongMove),
        criteria: (Array.isArray(b.criteria) ? b.criteria : []).map(String),
        caught: (Array.isArray(b.caught) ? b.caught : []).map(Number),
      })),
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
  };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Screenshots are named by the first 20 hex digits of their SHA-1, the same as screenshots already stored.
async function sha1(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes as Uint8Array<ArrayBuffer>));
  return [...digest.slice(0, 10)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
