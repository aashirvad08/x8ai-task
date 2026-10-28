import * as React from "react";
import { fmtScore, modelColor, scoreTone } from "@/lib/format";
import type { Criterion, ReviewStatus, Rollout, Tone } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ModelDot({ model, all, className }: { model: string | null; all: string[]; className?: string }) {
  return <span className={cn("model-dot", className)} style={{ background: modelColor(model, all) }} />;
}

export function ModelName({ model, all }: { model: string | null; all: string[] }) {
  return (
    <span className="model-name">
      <ModelDot model={model} all={all} />
      {model ?? "unknown model"}
    </span>
  );
}

// A score in mono digits, coloured by outcome: full pass, partial, nothing.
export function Score({ value, size = "md", className }: { value: number | null; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  return (
    <span title={`Score ${fmtScore(value)}`} className={cn("score", `score-${size}`, `tone-${scoreTone(value)}`, className)}>
      {value == null ? "-" : value.toFixed(2)}
    </span>
  );
}

const STATUS: Record<ReviewStatus, string> = { reviewed: "Reviewed", verified: "Citations verified", draft: "Draft" };

export function ReviewStatusLine({ status }: { status: ReviewStatus }) {
  return (
    <span
      className={cn("review-status", `review-${status}`)}
      title={status === "verified" ? "Every cited step was checked against the recording" : undefined}
    >
      <i />
      {STATUS[status] ?? STATUS.draft}
    </span>
  );
}

// Short facts separated by middots.
export function MetaItems({ items, className }: { items: React.ReactNode[]; className?: string }) {
  return (
    <span className={cn("meta-items", className)}>
      {items.filter(Boolean).map((item, k) => (
        <span key={k}>{item}</span>
      ))}
    </span>
  );
}

export const toneClass = (t: Tone) => `tone-dot-${t}`;

// One dot per run: filled when this blocker caught the run.
export function CaughtDots({ caught, runs }: { caught: number[]; runs: Rollout[] }) {
  return (
    <span className="caught">
      <span className="caught-dots">
        {runs.map((r) => (
          <span key={r.idx} className={cn(caught.includes(r.idx) && "on")} title={`R${r.idx}${caught.includes(r.idx) ? " was caught" : " got through"}`} />
        ))}
      </span>
      <span className="caught-count">
        {caught.length}/{runs.length}
      </span>
    </span>
  );
}

export function RunChip({
  run,
  all,
  onClick,
  muted,
  filled,
}: {
  run: Rollout;
  all: string[];
  onClick?: () => void;
  muted?: boolean;
  filled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Run ${run.idx} · ${run.model} · score ${fmtScore(run.score)}`}
      className={cn("run-chip", filled && "run-chip-filled", muted && "run-chip-muted")}
    >
      <ModelDot model={run.model} all={all} />R{run.idx}
    </button>
  );
}

export function CritRef({ c, id }: { c?: Criterion; id: string }) {
  return (
    <span title={c?.explain ?? c?.description ?? undefined} className={cn("crit-ref", c?.kind === "guardrail" && "crit-ref-guard")}>
      {c?.label ?? id}
    </span>
  );
}

export type CheckState = "met" | "partial" | "missed" | "broken" | "none";

export function CheckGlyph({ state }: { state: CheckState }) {
  if (state === "none") return <span className="check-none">·</span>;
  return (
    <svg viewBox="0 0 12 12" className={cn("check-glyph", `check-${state}`)} aria-hidden="true">
      {state === "met" && <circle cx="6" cy="6" r="4.5" />}
      {state === "partial" && (
        <>
          <circle cx="6" cy="6" r="4.25" className="ring" />
          <path d="M6 1.75 A4.25 4.25 0 0 1 6 10.25 Z" />
        </>
      )}
      {state === "missed" && <circle cx="6" cy="6" r="4.25" className="ring" />}
      {state === "broken" && <circle cx="6" cy="6" r="4.5" />}
    </svg>
  );
}
