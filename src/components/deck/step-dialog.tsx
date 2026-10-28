"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, LoaderCircle, Play, X } from "lucide-react";
import { ActionLine } from "@/components/action-line";
import { useDataUrls, useRoutes } from "@/components/view";
import { ModelDot, Score } from "@/components/marks";
import { commandLine } from "@/components/player/terminal";
import { Screen } from "@/components/screen";
import { parseAction } from "@/lib/actions";
import type { StepRef } from "@/lib/citations";
import { loadSteps } from "@/lib/steps";
import type { Rollout, Step } from "@/lib/types";

// The screen at a cited step, with the action and reasoning beside it. Arrow keys move through the run.
export function StepDialog({
  task,
  version,
  target,
  rollouts,
  onClose,
}: {
  task: string;
  version: string;
  target: StepRef | null;
  rollouts: Rollout[];
  onClose: () => void;
}) {
  const router = useRouter();
  const urls = useDataUrls();
  const routes = useRoutes();
  const frameSrc = urls.frame;
  const [steps, setSteps] = React.useState<Step[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [n, setN] = React.useState(0);

  React.useEffect(() => {
    if (!target) return;
    let live = true;
    setSteps(null);
    setError(null);
    setN(target.step);
    loadSteps(urls.steps(task, version, target.rollout))
      .then((s) => live && setSteps(s))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [target, task, version, urls]);

  const pos = React.useMemo(() => (steps ? steps.findIndex((s) => s.n === n) : -1), [steps, n]);
  const step = steps && pos >= 0 ? steps[pos] : null;
  const run = rollouts.find((r) => r.idx === target?.rollout);
  const action = step ? parseAction(step.a) : null;
  const inRange = target ? (target.end ? n >= target.step && n <= target.end : n === target.step) : true;

  React.useEffect(() => {
    if (!target || !steps) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && pos > 0) setN(steps[pos - 1].n);
      if (e.key === "ArrowRight" && pos < steps.length - 1) setN(steps[pos + 1].n);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, steps, pos]);

  React.useEffect(() => {
    if (!steps || pos < 0) return;
    for (const d of [1, 2, -1]) {
      const s = steps[pos + d];
      if (s?.f) new Image().src = frameSrc(s.f);
    }
  }, [steps, pos, frameSrc]);

  return (
    <DialogPrimitive.Root open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content className="step-dialog" aria-describedby={undefined}>
          <div className="step-dialog-head">
            <DialogPrimitive.Title className="step-dialog-title">
              Run {target?.rollout} <span className="faint">·</span> Step <span className="mono">{n}</span>
              {steps && <span className="faint"> / {steps.length}</span>}
            </DialogPrimitive.Title>
            {run && (
              <span className="step-dialog-run">
                <ModelDot model={run.model} all={rollouts.map((r) => r.model)} />
                {run.model}
                <Score value={run.score} size="sm" />
              </span>
            )}
            {!inRange && <span className="step-dialog-out">outside the cited step</span>}
            <DialogPrimitive.Close className="icon-round ml-auto" aria-label="Close">
              <X size={16} />
            </DialogPrimitive.Close>
          </div>
          <div className="step-dialog-body">
            {error && <p className="step-dialog-msg tone-fail">{error}</p>}
            {!error && !steps && (
              <p className="step-dialog-msg">
                <LoaderCircle size={20} className="spin" />
              </p>
            )}
            {steps && !step && <p className="step-dialog-msg">Step {n} isn&apos;t in this run.</p>}
            {steps && step && action && (
              <div className="step-dialog-grid">
                {steps.some((s) => s.f) ? (
                  <Screen frame={step.f ?? lastFrameBefore(steps, pos)} overlay={action.overlay} showOverlay={!!step.f} className="framed" />
                ) : (
                  <div className="terminal terminal-single">
                    <div className="term-entry current">
                      <div className="term-cmd">
                        <span className="term-n">{step.n}</span>
                        <span className="term-prompt">{commandLine(step).shell ? "$" : "→"}</span>
                        <span className="term-text">{commandLine(step).text}</span>
                      </div>
                      {step.o ? <pre className="term-out">{step.o}</pre> : <p className="term-none">No output was recorded for this step.</p>}
                    </div>
                  </div>
                )}
                <div className="step-dialog-side">
                  <div>
                    <div className="eyebrow mb-2">Action</div>
                    <ActionLine action={action} />
                    {step.c && <p className="step-clock-line">{step.c}</p>}
                  </div>
                  <div className="step-dialog-reasoning">
                    <div className="eyebrow mb-2">Reasoning</div>
                    {step.t ? <p className="reasoning">{step.t}</p> : <p className="muted">No reasoning was recorded for this step.</p>}
                  </div>
                  <p className="caption">
                    {steps.some((s) => s.f) ? "The screen after this step; the marker shows where the action landed." : "The command or call, and what it returned."}
                  </p>
                  <div className="step-dialog-nav">
                    <div>
                      <button className="icon-round" aria-label="Previous step (←)" title="Previous step (←)" disabled={pos <= 0} onClick={() => setN(steps[pos - 1].n)}>
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        className="icon-round"
                        aria-label="Next step (→)"
                        title="Next step (→)"
                        disabled={pos >= steps.length - 1}
                        onClick={() => setN(steps[pos + 1].n)}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                    <button
                      className="button button-primary button-sm"
                      onClick={() => {
                        onClose();
                        if (target) router.push(routes.player(task, target.rollout, n));
                      }}
                    >
                      <Play size={11} fill="currentColor" /> Open in player
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// A step whose screen didn't change shows the last screenshot taken before it.
function lastFrameBefore(steps: Step[], pos: number) {
  for (let i = pos; i >= 0; i--) if (steps[i].f) return steps[i].f;
  return null;
}
