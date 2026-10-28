// The scores sheet: three tabs (Summary, Tasks, Runs) built from the batch, used by the sheet view,
// the CSV and Excel downloads, and the CSV endpoint that Google Sheets can import.
import { mean } from "./format";
import type { SheetPayload, SheetRun } from "./types";

export type CellKind = "label" | "text" | "longtext" | "metric" | "int" | "score" | "link";
export type Cell = { v: string | number | null; kind?: CellKind; hint?: string; taskId?: string; runIdx?: number; href?: string };
export type HeaderCell = { label: string; span?: number; rowSpan?: number } | null;
export type Column = { label: string; width: number; kind: CellKind };
export type SheetTab = {
  key: "summary" | "tasks" | "runs";
  name: string;
  description: string;
  meta: [string, string][];
  header: HeaderCell[][];
  columns: Column[];
  rows: Cell[][];
  footer: Cell[][];
  frozenColumns: number;
};
export type Links = { taskUrl?: (task: string) => string; runUrl?: (task: string, idx: number) => string };

const perModelCounts = (p: SheetPayload) =>
  new Set(p.tasks.flatMap((t) => p.models.map((m) => t.runs.filter((r) => r.model === m).length)).filter((n) => n > 0));

function attempts(p: SheetPayload) {
  const perTask = new Set(p.tasks.map((t) => t.runs.length));
  const perModel = perModelCounts(p);
  return `${perTask.size === 1 ? `${[...perTask][0]} per task` : "varies by task"} | ${perModel.size === 1 ? `${[...perModel][0]} per model` : "varies by model"}`;
}

export function runsPerModel(p: SheetPayload) {
  const s = perModelCounts(p);
  return s.size === 1 ? [...s][0] : null;
}

export function buildSheet(p: SheetPayload, links: Links = {}): SheetTab[] {
  const n = runsPerModel(p);
  const meanOf = n ? `mean of ${n} runs` : "mean of runs";
  const byScore = p.criteria === "score";
  const achievementLabel = `Criteria achievement (${byScore ? "task score" : "checks passed / total"})`;
  const metric = (v: number, hint?: string): Cell => ({ v: Number.isFinite(v) ? v : null, kind: "metric", hint });
  const achievementHint = (rs: SheetRun[]) =>
    rs.length
      ? `Mean criteria score ${mean(rs.map((r) => r.achievement)).toFixed(3)}: ${byScore ? "the grader's task score" : "checks met ÷ all checks"}, averaged over ${rs.length} run${rs.length === 1 ? "" : "s"}`
      : undefined;
  const completionHint = (rs: SheetRun[]) =>
    rs.length ? `${rs.filter((r) => r.completed).length} of ${rs.length} run${rs.length === 1 ? "" : "s"} passed every check` : undefined;
  const pair = (rs: SheetRun[]) => [
    metric(mean(rs.map((r) => r.achievement)), achievementHint(rs)),
    metric(mean(rs.map((r) => r.completed)), completionHint(rs)),
  ];
  const meta: [string, string][] = [
    ["Tasks", String(p.tasks.length)],
    ["Attempts", attempts(p)],
  ];
  const taskCell = (t: SheetPayload["tasks"][number]): Cell => ({ v: t.slug, kind: "label", taskId: t.id, href: links.taskUrl?.(t.id) });

  const summaryRows = p.tasks.map((t) => [
    taskCell(t),
    { v: t.sourceTraceId ?? t.code, kind: "text" } as Cell,
    ...p.models.flatMap((m) => pair(t.runs.filter((r) => r.model === m))),
    ...pair(t.runs),
    { v: t.runs.length, kind: "int" } as Cell,
  ]);
  const all = p.tasks.flatMap((t) => t.runs);
  const summaryFooter: Cell[] = [
    { v: "ALL (scored attempts only)", kind: "label" },
    { v: null },
    ...p.models.flatMap((m) => pair(all.filter((r) => r.model === m))),
    ...pair(all),
    { v: all.length, kind: "int" },
  ];

  return [
    {
      key: "summary",
      name: "Summary",
      description: `Mean criteria achievement (${byScore ? "task score" : "checks passed / total"}) and task completion rate (share of full passes), per model and pooled.`,
      meta,
      header: [
        [
          { label: "Task slug", rowSpan: 2 },
          { label: "Trace", rowSpan: 2 },
          ...p.models.flatMap((m) => [{ label: `${m} [${meanOf}]`, span: 2 }, null]),
          { label: "Pooled", span: 2 },
          null,
          { label: "n", rowSpan: 2 },
        ],
        [
          null,
          null,
          ...p.models.flatMap(() => [{ label: "Mean criteria achievement" }, { label: "Task completion rate" }]),
          { label: "Mean criteria achievement" },
          { label: "Task completion rate" },
          null,
        ],
      ],
      columns: [
        { label: "Task slug", width: 38, kind: "label" },
        { label: "Trace", width: 9, kind: "text" },
        ...p.models.flatMap((m): Column[] => [
          { label: `${m} · Mean criteria achievement`, width: 24, kind: "metric" },
          { label: `${m} · Task completion rate`, width: 20, kind: "metric" },
        ]),
        { label: "Pooled · Mean criteria achievement", width: 24, kind: "metric" },
        { label: "Pooled · Task completion rate", width: 20, kind: "metric" },
        { label: "n", width: 6, kind: "int" },
      ],
      rows: summaryRows,
      footer: [summaryFooter],
      frozenColumns: 1,
    },
    {
      key: "tasks",
      name: "Tasks",
      description: "What each task asks for, and how each model did on it.",
      meta,
      header: [
        [
          { label: "Task ID", rowSpan: 2 },
          { label: "Source trace", rowSpan: 2 },
          { label: "Task", rowSpan: 2 },
          { label: "App(s)", rowSpan: 2 },
          { label: "Category", rowSpan: 2 },
          { label: "Task summary", rowSpan: 2 },
          { label: "Complete task instruction", rowSpan: 2 },
          ...p.models.flatMap((m) => [{ label: m, span: 3 }, null, null]),
        ],
        [
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          ...p.models.flatMap(() => [
            { label: `Mean criteria achievement${n ? ` @ ${n}` : ""}` },
            { label: `Task completion rate${n ? ` @ ${n}` : ""}` },
            { label: "Mean trajectory steps" },
          ]),
        ],
      ],
      columns: [
        { label: "Task ID", width: 38, kind: "label" },
        { label: "Source trace", width: 12, kind: "text" },
        { label: "Task", width: 32, kind: "text" },
        { label: "App(s)", width: 34, kind: "text" },
        { label: "Category", width: 26, kind: "text" },
        { label: "Task summary", width: 60, kind: "longtext" },
        { label: "Complete task instruction", width: 80, kind: "longtext" },
        ...p.models.flatMap((m): Column[] => [
          { label: `${m} · Mean criteria achievement`, width: 22, kind: "metric" },
          { label: `${m} · Task completion rate`, width: 20, kind: "metric" },
          { label: `${m} · Mean trajectory steps`, width: 18, kind: "int" },
        ]),
      ],
      rows: p.tasks.map((t) => [
        taskCell(t),
        { v: t.sourceTraceId ?? t.code, kind: "text" },
        { v: t.name, kind: "text" },
        { v: t.apps.join(", ") || null, kind: "text" },
        { v: t.domain, kind: "text" },
        { v: t.headline, kind: "longtext" },
        { v: t.instruction || null, kind: "longtext" },
        ...p.models.flatMap((m): Cell[] => {
          const rs = t.runs.filter((r) => r.model === m);
          const steps = mean(rs.map((r) => r.steps));
          return [...pair(rs), { v: Number.isFinite(steps) ? Math.round(steps * 10) / 10 : null, kind: "int" }];
        }),
      ]),
      footer: [],
      frozenColumns: 1,
    },
    {
      key: "runs",
      name: "Runs",
      description: "Every run: checks passed, whether it was a full pass, the grader's score and a one-line summary.",
      meta,
      header: [
        [
          { label: "Task ID" },
          { label: "Model" },
          { label: "Run" },
          { label: achievementLabel },
          { label: "Task completion score (0/1)" },
          { label: "Checks passed" },
          { label: "Checks total" },
          { label: "Grader score" },
          { label: "Trajectory steps" },
          { label: "Trajectory summary" },
          { label: "Open" },
        ],
      ],
      columns: [
        { label: "Task ID", width: 38, kind: "label" },
        { label: "Model", width: 16, kind: "text" },
        { label: "Run", width: 8, kind: "text" },
        { label: achievementLabel, width: 22, kind: "metric" },
        { label: "Task completion score (0/1)", width: 16, kind: "int" },
        { label: "Checks passed", width: 10, kind: "int" },
        { label: "Checks total", width: 10, kind: "int" },
        { label: "Grader score", width: 12, kind: "score" },
        { label: "Trajectory steps", width: 12, kind: "int" },
        { label: "Trajectory summary", width: 70, kind: "longtext" },
        { label: "Open", width: 12, kind: "link" },
      ],
      rows: p.tasks.flatMap((t) =>
        [...t.runs]
          .sort((a, b) => p.models.indexOf(a.model) - p.models.indexOf(b.model) || a.idx - b.idx)
          .map((r): Cell[] => [
            taskCell(t),
            { v: r.model, kind: "text" },
            { v: `run${String(r.idx).padStart(2, "0")}`, kind: "text" },
            metric(
              r.achievement,
              byScore ? `Task score ${r.score}; ${r.passed} of ${r.total} graded checks met` : `${r.passed} of ${r.total} graded checks met`,
            ),
            { v: r.completed, kind: "int", hint: r.completed ? "Passed every check" : "Did not pass every check" },
            { v: r.passed, kind: "int" },
            { v: r.total, kind: "int" },
            { v: r.score, kind: "score" },
            { v: r.steps, kind: "int" },
            { v: r.summary, kind: "longtext" },
            { v: "Open run", kind: "link", taskId: t.id, runIdx: r.idx, href: links.runUrl?.(t.id, r.idx) },
          ]),
      ),
      footer: [],
      frozenColumns: 1,
    },
  ];
}

const csvField = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function toCsv(tab: SheetTab) {
  const lines = [tab.columns.map((c) => csvField(c.label)).join(",")];
  for (const row of [...tab.rows, ...tab.footer]) {
    lines.push(
      row
        .map((c) =>
          c.v === null || c.v === undefined
            ? ""
            : c.kind === "link"
              ? csvField(c.href ?? String(c.v))
              : typeof c.v === "number"
                ? c.kind === "metric"
                  ? c.v.toFixed(4)
                  : String(c.v)
                : csvField(String(c.v)),
        )
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

export const safeFileName = (s: string) =>
  s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "scores";

// How a cell reads in the sheet view.
export function cellText(c: Cell) {
  if (c.v === null || c.v === undefined) return "";
  if (typeof c.v !== "number") return String(c.v);
  if (c.kind === "metric") return c.v.toFixed(3);
  if (c.kind === "score") return c.v.toFixed(2);
  return Number.isInteger(c.v) ? c.v.toLocaleString("en-US") : c.v.toFixed(1);
}
