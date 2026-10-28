// Checks the task document an upload sends before it is stored. The browser already checked the package; this makes
// sure nothing malformed reaches other people's screens, whatever sent it.
import type { Task } from "@/lib/types";

type Doc = Omit<Task, "id" | "lab" | "folder" | "status" | "version">;
type Json = Record<string, unknown>;

const MAX_DOC_BYTES = 1_500_000;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

class Invalid extends Error {}

function text(v: unknown, where: string, max = 20_000, optional = false): string {
  if ((v === null || v === undefined) && optional) return "";
  if (typeof v !== "string") throw new Invalid(`${where} must be text`);
  if (v.length > max) throw new Invalid(`${where} is longer than ${max} characters`);
  return v;
}
const maybe = (v: unknown, where: string, max = 20_000) => (v === null || v === undefined || v === "" ? null : text(v, where, max));
function num(v: unknown, where: string, min = -Infinity, max = Infinity): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Invalid(`${where} must be a number from ${min} to ${max}`);
  return v;
}
function list<T>(v: unknown, where: string, max: number, each: (x: unknown, i: number) => T): T[] {
  if (!Array.isArray(v)) throw new Invalid(`${where} must be a list`);
  if (v.length > max) throw new Invalid(`${where} has more than ${max} entries`);
  return v.map(each);
}
function obj(v: unknown, where: string): Json {
  if (!isObj(v)) throw new Invalid(`${where} must be an object`);
  return v;
}
const oneOf = <T extends string>(v: unknown, where: string, options: readonly T[]): T => {
  if (!options.includes(v as T)) throw new Invalid(`${where} must be one of ${options.join(", ")}`);
  return v as T;
};

export function validateTaskDoc(input: unknown): { ok: true; doc: Doc } | { ok: false; error: string } {
  try {
    const t = obj(input, "task");
    const docIn = obj(t.doc, "task.doc");
    const statsIn = obj(t.stats, "task.stats");
    const doc: Doc = {
      code: text(t.code, "code", 40),
      slug: text(t.slug, "slug", 120),
      name: text(t.name, "name", 300),
      sourceTraceId: maybe(t.sourceTraceId, "sourceTraceId", 60),
      headline: maybe(t.headline, "headline", 2_000),
      domain: maybe(t.domain, "domain", 200),
      principal: text(t.principal ?? "", "principal", 200),
      modality: t.modality === undefined ? undefined : oneOf(t.modality, "modality", ["gui", "terminal", "tool"] as const),
      doc: {
        instruction: text(docIn.instruction, "instruction", 200_000),
        apps: list(docIn.apps, "apps", 50, (a, i) => {
          const o = obj(a, `apps[${i}]`);
          return { name: text(o.name, `apps[${i}].name`, 200), role: text(o.role, `apps[${i}].role`, 2_000, true) };
        }),
        details: list(docIn.details, "details", 50, (d, i) => {
          const o = obj(d, `details[${i}]`);
          return { title: text(o.title, `details[${i}].title`, 300), body: text(o.body, `details[${i}].body`, 20_000, true) };
        }),
        criteria: list(docIn.criteria, "criteria", 1_000, (c, i) => {
          const o = obj(c, `criteria[${i}]`);
          return {
            id: text(o.id, `criteria[${i}].id`, 200),
            label: text(o.label, `criteria[${i}].label`, 500),
            explain: maybe(o.explain, `criteria[${i}].explain`, 5_000),
            description: maybe(o.description, `criteria[${i}].description`, 5_000),
            weight: num(o.weight, `criteria[${i}].weight`, 0, 1_000),
            kind: oneOf(o.kind, `criteria[${i}].kind`, ["objective", "guardrail"] as const),
          };
        }),
        blockers: list(docIn.blockers, "blockers", 100, (b, i) => {
          const o = obj(b, `blockers[${i}]`);
          const w = `blockers[${i}]`;
          return {
            id: text(o.id, `${w}.id`, 100, true),
            title: text(o.title, `${w}.title`, 500),
            kind: text(o.kind, `${w}.kind`, 100, true),
            origin: text(o.origin, `${w}.origin`, 100, true),
            whatAgentSees: text(o.whatAgentSees, `${w}.whatAgentSees`, 20_000, true),
            whyHard: text(o.whyHard, `${w}.whyHard`, 20_000, true),
            rightPath: text(o.rightPath, `${w}.rightPath`, 20_000, true),
            wrongMove: text(o.wrongMove, `${w}.wrongMove`, 20_000, true),
            criteria: list(o.criteria, `${w}.criteria`, 200, (c) => text(c, `${w}.criteria`, 200)),
            caught: list(o.caught, `${w}.caught`, 200, (r) => num(r, `${w}.caught`, 0, 1e6)),
          };
        }),
      },
      rollouts: list(t.rollouts, "rollouts", 60, (r, i) => {
        const o = obj(r, `rollouts[${i}]`);
        const w = `rollouts[${i}]`;
        const scores = obj(o.scores, `${w}.scores`);
        if (Object.keys(scores).length > 1_000) throw new Invalid(`${w}.scores has too many checks`);
        return {
          idx: num(o.idx, `${w}.idx`, 0, 1e6),
          model: text(o.model, `${w}.model`, 200),
          run: null,
          score: num(o.score, `${w}.score`, 0, 1),
          completed: num(o.completed, `${w}.completed`, 0, 1),
          passed: num(o.passed, `${w}.passed`, 0, 1e6),
          total: num(o.total, `${w}.total`, 0, 1e6),
          steps: num(o.steps, `${w}.steps`, 0, 1e6),
          durationSec: o.durationSec === null || o.durationSec === undefined ? null : num(o.durationSec, `${w}.durationSec`, 0, 1e9),
          span: null,
          scores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [text(k, `${w}.scores key`, 200), num(v, `${w}.scores.${k}`, 0, 1)])),
          hardZero: list(o.hardZero, `${w}.hardZero`, 1_000, (h) => text(h, `${w}.hardZero`, 200)),
          events: [],
        };
      }),
      failureModes: list(t.failureModes, "failureModes", 100, (f, i) => {
        const o = obj(f, `failureModes[${i}]`);
        const w = `failureModes[${i}]`;
        return {
          id: text(o.id, `${w}.id`, 50),
          status: oneOf(o.status, `${w}.status`, ["draft", "verified", "reviewed"] as const),
          title: text(o.title, `${w}.title`, 500),
          summary: text(o.summary, `${w}.summary`, 20_000),
          rollouts: list(o.rollouts, `${w}.rollouts`, 200, (r) => num(r, `${w}.rollouts`, 0, 1e6)),
          criteria: list(o.criteria, `${w}.criteria`, 200, (c) => text(c, `${w}.criteria`, 200)),
          attribution: text(o.attribution, `${w}.attribution`, 50),
          severity: text(o.severity, `${w}.severity`, 50),
        };
      }),
      writeups: list(t.writeups, "writeups", 60, (x, i) => {
        const o = obj(x, `writeups[${i}]`);
        const w = `writeups[${i}]`;
        return {
          rollout: num(o.rollout, `${w}.rollout`, 0, 1e6),
          status: oneOf(o.status, `${w}.status`, ["draft", "verified", "reviewed"] as const),
          title: text(o.title, `${w}.title`, 500),
          body: text(o.body, `${w}.body`, 30_000),
          keyMoments: list(o.keyMoments, `${w}.keyMoments`, 100, (k, j) => {
            const m = obj(k, `${w}.keyMoments[${j}]`);
            return {
              step: num(m.step, `${w}.keyMoments[${j}].step`, 0, 1e6),
              label: text(m.label, `${w}.keyMoments[${j}].label`, 300),
              tone: oneOf(m.tone, `${w}.keyMoments[${j}].tone`, ["good", "bad", "neutral"] as const),
            };
          }),
        };
      }),
      stats: {
        rollouts: num(statsIn.rollouts, "stats.rollouts", 0, 1e6),
        steps: num(statsIn.steps, "stats.steps", 0, 1e9),
        models: list(statsIn.models, "stats.models", 60, (m, i) => {
          const o = obj(m, `stats.models[${i}]`);
          return {
            model: text(o.model, `stats.models[${i}].model`, 200),
            n: num(o.n, `stats.models[${i}].n`, 0, 1e6),
            passes: num(o.passes, `stats.models[${i}].passes`, 0, 1e6),
            mean: o.mean === null ? null : num(o.mean, `stats.models[${i}].mean`, 0, 1),
          };
        }),
      },
    };
    if (!doc.rollouts.length) throw new Invalid("the task has no runs");
    if (new Set(doc.rollouts.map((r) => r.idx)).size !== doc.rollouts.length) throw new Invalid("two runs have the same number");
    if (JSON.stringify(doc).length > MAX_DOC_BYTES) throw new Invalid("the task's description, grading and write-ups are too large together (over 1.5 MB)");
    return { ok: true, doc };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message };
    throw e;
  }
}

// One run's steps: [{ n, a, t?, o?, f }].
export function validateSteps(input: unknown, isFrame: (h: string) => boolean): { ok: true; frames: Set<string>; count: number } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "steps must be a list" };
  if (input.length > 20_000) return { ok: false, error: "more than 20,000 steps in one run" };
  const frames = new Set<string>();
  for (const [i, s] of input.entries()) {
    if (!isObj(s) || !Number.isInteger(s.n) || typeof s.a !== "string") return { ok: false, error: `step ${i + 1} needs a number and an action` };
    if ((s.t !== undefined && typeof s.t !== "string") || (s.o !== undefined && typeof s.o !== "string"))
      return { ok: false, error: `step ${s.n}: reasoning and output must be text` };
    if (s.f !== null && (typeof s.f !== "string" || !isFrame(s.f))) return { ok: false, error: `step ${s.n}: bad screenshot reference` };
    if (s.f) frames.add(s.f);
  }
  return { ok: true, frames, count: input.length };
}
