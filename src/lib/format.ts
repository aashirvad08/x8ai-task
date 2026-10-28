// Numbers, durations and labels shared by the deck, the player and the scores sheet.

export type ScoreTone = "pass" | "partial" | "fail";

// 0.5 -> "0.5", 1 -> "1", null -> "-"
export function fmtScore(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "-";
  return v.toFixed(2).replace(/\.?0+$/, (m) => (m.startsWith(".") ? "" : m)) || "0";
}

export const scoreTone = (v: number | null | undefined): ScoreTone => (!v ? "fail" : v >= 1 ? "pass" : "partial");
export const fmtInt = (n: number) => n.toLocaleString("en-US");
export const pad2 = (n: number) => String(n).padStart(2, "0");
export const plural = (n: number, one: string, many = `${one}s`) => `${fmtInt(n)} ${n === 1 ? one : many}`;

// 47680 -> "13.24 h"
export const fmtHours = (sec: number) => `${(sec / 3600).toFixed(2)} h`;

// 47680 -> "13 h 15 min"
export function fmtDuration(sec: number) {
  const min = Math.round(sec / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

// Each model keeps one colour everywhere: its position among all models, sorted by name.
export function modelColor(model: string | null | undefined, all: string[]) {
  const sorted = [...new Set(all.filter(Boolean))].sort();
  const i = model ? sorted.indexOf(model) : -1;
  return `var(--model-${(i < 0 ? 0 : i % 4) + 1})`;
}

const BLOCKER_KIND: Record<string, string> = {
  "hidden-evidence": "Hidden evidence",
  "timing-window": "Timing window",
  "irreversible-action": "Irreversible action",
  restraint: "Restraint",
  "privacy-boundary": "Privacy boundary",
  decoy: "Decoy",
  "gated-process": "Gated process",
  "derived-answer": "Derived answer",
};
export const blockerKind = (k: string) => BLOCKER_KIND[k] ?? k.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
export const blockerOrigin = (o: string) => (o === "source-trace" ? "From the original case" : "Added in the task");

export const SEVERITY: Record<string, string> = { critical: "Critical", major: "Major", minor: "Minor" };
export const ATTRIBUTION: Record<string, string> = {
  model: "Model behaviour",
  environment: "Environment issue",
  mixed: "Model and environment",
};

// Index of the last step at or before each step that carries a screenshot, or -1 before the first one.
export function lastFrameIndex(steps: { f: string | null }[]) {
  let last = -1;
  return steps.map((s, i) => (s.f ? (last = i) : last));
}

// Screenshots are stored smaller than the screen the agent clicked on; marks are drawn in the agent's coordinates.
export const SCREEN = { w: 1280, h: 900 };

// 231.9 MB, 12 KB
export const fmtBytes = (n: number) => (n < 1e6 ? `${Math.round(n / 1e3)} KB` : n < 1e9 ? `${(n / 1e6).toFixed(1)} MB` : `${(n / 1e9).toFixed(2)} GB`);

// 14 Oct 2026
export const fmtDate = (ms: number | null | undefined) =>
  ms ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "never";

// "just now", "5 min ago", "3 h ago", "2 days ago", then the date
export function fmtAgo(ms: number | null | undefined, now = Date.now()) {
  if (!ms) return "never";
  const s = Math.round((now - ms) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 30 * 86400) return `${Math.round(s / 86400)} day${Math.round(s / 86400) === 1 ? "" : "s"} ago`;
  return fmtDate(ms);
}
