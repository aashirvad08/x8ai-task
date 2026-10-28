export type CriterionKind = "objective" | "guardrail";

export type Criterion = {
  id: string;
  label: string;
  explain: string | null;
  description: string | null;
  weight: number;
  kind: CriterionKind;
};

export type Blocker = {
  id: string;
  title: string;
  kind: string;
  origin: string;
  whatAgentSees: string;
  whyHard: string;
  rightPath: string;
  wrongMove: string;
  criteria: string[];
  caught: number[];
};

// A change in the simulated world (a text, a posting, a silent hold) and the step where it landed.
export type WorldEvent = { step: number; label: string; time: string; silent: boolean };

export type Rollout = {
  idx: number;
  model: string;
  run: string | null;
  score: number;
  completed: number;
  passed: number;
  total: number;
  steps: number;
  durationSec: number | null;
  span: [string | null, string | null] | null;
  scores: Record<string, number>;
  hardZero: string[];
  events: WorldEvent[];
};

export type Tone = "good" | "bad" | "neutral";
export type KeyMoment = { step: number; label: string; tone: Tone };
export type ReviewStatus = "draft" | "verified" | "reviewed";

export type Writeup = { rollout: number; status: ReviewStatus; title: string; body: string; keyMoments: KeyMoment[] };

export type FailureMode = {
  id: string;
  status: ReviewStatus;
  title: string;
  summary: string;
  rollouts: number[];
  criteria: string[];
  attribution: string;
  severity: string;
};

export type LabRef = { id: string; slug: string; name: string };

export type Modality = "gui" | "terminal" | "tool";
export type TaskStatus = "draft" | "published";

export type Task = {
  id: string;
  lab: LabRef;
  folder: string;
  status: TaskStatus;
  version: string;
  modality?: Modality;
  code: string;
  slug: string;
  name: string;
  sourceTraceId: string | null;
  headline: string | null;
  domain: string | null;
  principal: string;
  doc: {
    instruction: string;
    apps: { name: string; role: string }[];
    details: { title: string; body: string }[];
    criteria: Criterion[];
    blockers: Blocker[];
  };
  rollouts: Rollout[];
  failureModes: FailureMode[];
  writeups: Writeup[];
  stats: { rollouts: number; steps: number; models: { model: string; n: number; passes: number; mean: number | null }[] };
};

export type CriteriaMode = "checks" | "score";

// One recorded action. `f` is set only when the screen changed; `o` is what the agent got back (terminal output, a tool
// result); `c` is the in-world clock, `r` a short tool result, `x` an error.
export type Step = { n: number; a: string; t?: string; f: string | null; o?: string; c?: string; r?: string; x?: string };

export type NavTask = { id: string; code: string; name: string; status: TaskStatus; rollouts: { idx: number; model: string; score: number }[] };
export type NavLab = LabRef & { tasks: NavTask[] };

// What the overview and the scores sheet need, without the long task documents.
export type SheetRun = {
  idx: number;
  model: string;
  score: number;
  passed: number;
  total: number;
  achievement: number;
  completed: number;
  steps: number;
  summary: string | null;
};

export type SheetTask = {
  id: string;
  status: TaskStatus;
  code: string;
  slug: string;
  name: string;
  sourceTraceId: string | null;
  domain: string | null;
  headline: string | null;
  apps: string[];
  instruction: string;
  blockers: number;
  steps: number;
  runs: SheetRun[];
};

export type SheetPayload = {
  lab: LabRef;
  title: string;
  description: string;
  criteria: CriteriaMode;
  googleSheetUrl: string | null;
  models: string[];
  tasks: SheetTask[];
};
