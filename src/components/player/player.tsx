"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Clock, Crosshair, Keyboard, Link2, LoaderCircle, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { ActionLine } from "@/components/action-line";
import { LabView, useDataUrls, useRoutes } from "@/components/view";
import { ModelDot, ReviewStatusLine, Score, toneClass } from "@/components/marks";
import { StepList } from "@/components/player/step-list";
import { TerminalView } from "@/components/player/terminal";
import { Timeline } from "@/components/player/timeline";
import { CriteriaContext, RichText, StepRefContext } from "@/components/rich-text";
import { Screen } from "@/components/screen";
import { useToast } from "@/components/toast";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { parseAction, type ParsedAction } from "@/lib/actions";
import { parseCitations, type StepRef } from "@/lib/citations";
import { fmtDuration, fmtHours, fmtInt, lastFrameIndex } from "@/lib/format";
import { loadSteps } from "@/lib/steps";
import type { KeyMoment, Step, Task, WorldEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

const SPEEDS = [1, 2, 4, 8, 16];
type Tab = "step" | "writeup" | "steps";

// Loads the run's steps, then hands over to the player.
export function Player({ task, idx }: { task: Task; idx: number }) {
  return (
    <LabView lab={task.lab.id}>
      <PlayerLoader task={task} idx={idx} />
    </LabView>
  );
}

function PlayerLoader({ task, idx }: { task: Task; idx: number }) {
  const urls = useDataUrls();
  const [steps, setSteps] = React.useState<Step[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true;
    loadSteps(urls.steps(task.id, task.version, idx))
      .then((s) => live && setSteps(s))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [task.id, task.version, idx, urls]);

  if (error) return <div className="player-message fullbleed">This run didn&apos;t load ({error}). Reload the page to try again.</div>;
  if (!steps)
    return (
      <div className="player-message fullbleed">
        <LoaderCircle size={20} className="spin" /> Loading the recording…
      </div>
    );
  if (!steps.length) return <div className="player-message fullbleed">This run has no recorded steps.</div>;
  return <PlayerView task={task} idx={idx} steps={steps} />;
}

function ControlButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={cn("control", active && "active")}>
      {children}
    </button>
  );
}

// Type a step number and press Enter to go there.
function StepInput({ value, max, total, onSeek }: { value: number; max: number; total: number; onSeek: (n: number) => void }) {
  const [text, setText] = React.useState(String(value));
  React.useEffect(() => setText(String(value)), [value]);
  return (
    <form
      className="step-input"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(text);
        if (Number.isFinite(n) && text) onSeek(Math.max(1, Math.min(max, n)));
        (document.activeElement as HTMLElement | null)?.blur();
      }}
    >
      Step
      <input value={text} onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ""))} onBlur={() => setText(String(value))} aria-label="Go to step" />
      <span>/ {fmtInt(total)}</span>
    </form>
  );
}

function PlayerView({ task, idx, steps }: { task: Task; idx: number; steps: Step[] }) {
  const router = useRouter();
  const toast = useToast();
  const frameSrc = useDataUrls().frame;
  const routes = useRoutes();
  const run = task.rollouts.find((r) => r.idx === idx);
  const writeup = task.writeups.find((w) => w.rollout === idx);
  const models = task.rollouts.map((r) => r.model);
  const deckHref = routes.deckRun(task.id, idx);

  const [i, setI] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState(2);
  const [marker, setMarker] = React.useState(true);
  const [tab, setTab] = React.useState<Tab>(writeup ? "writeup" : "step");
  const [help, setHelp] = React.useState(false);

  const step = steps[i];
  const action = React.useMemo(() => parseAction(step?.a ?? ""), [step]);
  const lastFrame = React.useMemo(() => lastFrameIndex(steps), [steps]);
  // Command-line and tool runs have no screen to show; their stage is the terminal.
  const textOnly = task.modality === "terminal" || task.modality === "tool" || !steps.some((s) => s.f);
  const shown = steps[lastFrame[i] ?? -1];
  const ownFrame = lastFrame[i] === i;

  const moments = React.useMemo(() => [...(writeup?.keyMoments ?? [])].sort((a, b) => a.step - b.step), [writeup]);
  const momentAt = React.useMemo(() => new Map(moments.map((m) => [m.step, m])), [moments]);
  // Steps cited in this run's write-up or in a failure mode, and where each citation comes from.
  const citations = React.useMemo(() => {
    const map = new Map<number, string[]>();
    const add = (ref: StepRef, source: string) => {
      if (ref.rollout !== idx) return;
      for (let n = ref.step; n <= (ref.end ?? ref.step); n++) map.set(n, [...(map.get(n) ?? []), source]);
    };
    for (const f of task.failureModes) for (const ref of parseCitations(f.summary)) add(ref, f.title);
    if (writeup) for (const ref of parseCitations(writeup.body, idx)) add(ref, "This run's write-up");
    return map;
  }, [task.failureModes, writeup, idx]);
  const events = React.useMemo(() => run?.events ?? [], [run]);
  const eventsAt = React.useMemo(() => {
    const map = new Map<number, WorldEvent[]>();
    for (const e of events) map.set(e.step, [...(map.get(e.step) ?? []), e]);
    return map;
  }, [events]);

  const seekStep = React.useCallback(
    (n: number) => {
      const k = steps.findIndex((s) => s.n >= n);
      setI(k < 0 ? steps.length - 1 : k);
    },
    [steps],
  );
  const seek = React.useCallback((k: number) => setI(Math.max(0, Math.min(steps.length - 1, k))), [steps.length]);

  // Start where the link points (?step=), then keep the address on the current step.
  React.useEffect(() => {
    const want = Number(new URLSearchParams(window.location.search).get("step"));
    if (want) seekStep(want);
  }, [seekStep]);
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      const url = new URL(window.location.href);
      if (url.searchParams.get("step") === String(step.n)) return;
      url.searchParams.set("step", String(step.n));
      window.history.replaceState(window.history.state, "", url);
    }, 250);
    return () => window.clearTimeout(id);
  }, [step.n]);

  React.useEffect(() => {
    if (!playing) return;
    if (i >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setI((k) => Math.min(steps.length - 1, k + 1)), 1000 / speed);
    return () => window.clearTimeout(id);
  }, [playing, i, speed, steps.length]);

  // Warm the next screenshots, further ahead while playing fast.
  React.useEffect(() => {
    const ahead = playing ? Math.min(24, speed * 3) : 3;
    for (let d = -1; d <= ahead; d++) {
      const s = steps[i + d];
      if (s?.f && d !== 0) new Image().src = frameSrc(s.f);
    }
  }, [i, playing, speed, steps, frameSrc]);

  // Next or previous key moment; cited steps stand in when the run has no key moments.
  const jump = React.useCallback(
    (dir: 1 | -1) => {
      const here = steps[i]?.n ?? 0;
      const marks = moments.length ? moments.map((m) => m.step) : [...citations.keys()].sort((a, b) => a - b);
      const target = dir > 0 ? marks.find((n) => n > here) : [...marks].reverse().find((n) => n < here);
      if (target !== undefined) seekStep(target);
    },
    [steps, i, moments, citations, seekStep],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Keys pressed in a dialog belong to it, even when the dialog has already closed on this keypress.
      if (el?.closest('[role="dialog"],[role="menu"]')) return;
      if (help) {
        if (e.key === "?") setHelp(false);
        return;
      }
      const by = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        seek(i + by);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seek(i - by);
      } else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "Home") seek(0);
      else if (e.key === "End") seek(steps.length - 1);
      else if (e.key === "n" || e.key === "]") jump(1);
      else if (e.key === "p" || e.key === "[") jump(-1);
      else if (e.key === "m") setMarker((v) => !v);
      else if (e.key === "?") setHelp(true);
      else if (e.key === "Escape") router.push(deckHref);
      else if (/^[1-9]$/.test(e.key)) {
        const r = task.rollouts[Number(e.key) - 1];
        if (r && r.idx !== idx) router.push(routes.player(task.id, r.idx));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seek, i, steps.length, jump, help, router, deckHref, task, idx, routes]);

  React.useEffect(() => {
    document.title = `Run ${idx} · step ${step.n} · ${task.name} · Run Deck`;
  }, [idx, step.n, task.name]);

  // A citation in the write-up seeks here, or opens the other run at that step.
  const onStep = React.useCallback(
    (ref: StepRef) => {
      setPlaying(false);
      if (ref.rollout === idx) seekStep(ref.step);
      else router.push(routes.player(task.id, ref.rollout, ref.step));
    },
    [idx, seekStep, router, task.id, routes],
  );
  const criteria = React.useMemo(() => new Map(task.doc.criteria.map((c) => [c.id, c])), [task.doc.criteria]);
  const moment = momentAt.get(step.n);
  const here = eventsAt.get(step.n);

  return (
    <CriteriaContext.Provider value={criteria}>
      <StepRefContext.Provider value={{ onStep }}>
        <div className="player fullbleed">
          <header className="player-bar">
            <Link href={deckHref} className="player-back" title="Back to the deck (Esc)">
              <ArrowLeft size={15} /> <span>Deck</span>
            </Link>
            <span className="player-bar-sep" />
            <span className="player-task">
              <span className="mono">{task.code}</span> {task.name}
            </span>
            <nav className="player-runs" aria-label="Runs">
              <span className="player-runs-label">Run</span>
              <div>
                {task.rollouts.map((r) => (
                  <Link
                    key={r.idx}
                    href={routes.player(task.id, r.idx)}
                    title={`Run ${r.idx} · ${r.model} · score ${r.score}`}
                    aria-current={r.idx === idx ? "page" : undefined}
                  >
                    <ModelDot model={r.model} all={models} />
                    {r.idx}
                  </Link>
                ))}
              </div>
            </nav>
            {run?.durationSec ? (
              <span className="runtime-pill player-runtime" title={`Agent run time: ${fmtDuration(run.durationSec)}`}>
                <Clock size={13} /> <span className="muted">Run time</span> {fmtHours(run.durationSec)}
              </span>
            ) : null}
            {run && (
              <span className="player-model">
                {run.model} <Score value={run.score} size="sm" />
              </span>
            )}
          </header>

          <div className="player-body">
            <section className="player-stage">
              {textOnly ? (
                <div className="stage-text">
                  <TerminalView
                    steps={steps}
                    index={i}
                    onSeek={(k) => {
                      setPlaying(false);
                      seek(k);
                    }}
                  />
                </div>
              ) : (
                <div className="stage-wrap">
                  <div className="stage-box">
                    <Screen frame={shown?.f} overlay={action.overlay} showOverlay={marker && ownFrame} className="framed" />
                    {shown && !ownFrame && <div className="stage-badge stage-badge-br">Screenshot from step {fmtInt(shown.n)}</div>}
                    {moment && (
                      <div className="stage-badge stage-badge-tl">
                        <i className={cn("tone-dot", toneClass(moment.tone))} />
                        <span>{moment.label}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="player-controls">
                <Timeline
                  steps={steps}
                  index={i}
                  lastFrame={lastFrame}
                  moments={moments}
                  citations={citations}
                  events={events}
                  onSeek={(k) => {
                    setPlaying(false);
                    seek(k);
                  }}
                />
                <div className="control-row">
                  <div className="control-group">
                    <ControlButton label="Previous key moment (P)" onClick={() => jump(-1)}>
                      <SkipBack size={14} />
                    </ControlButton>
                    <ControlButton label="Previous step (←, Shift for 10)" onClick={() => seek(i - 1)}>
                      <ChevronLeft size={16} />
                    </ControlButton>
                    <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause (space)" : "Play (space)"} title={playing ? "Pause (space)" : "Play (space)"} className="play-button">
                      {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                    </button>
                    <ControlButton label="Next step (→, Shift for 10)" onClick={() => seek(i + 1)}>
                      <ChevronRight size={16} />
                    </ControlButton>
                    <ControlButton label="Next key moment (N)" onClick={() => jump(1)}>
                      <SkipForward size={14} />
                    </ControlButton>
                  </div>
                  <StepInput value={step.n} max={steps[steps.length - 1].n} total={steps.length} onSeek={seekStep} />
                  {step.c && <span className="control-clock">{step.c}</span>}
                  <div className="control-group ml-auto">
                    <button onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])} className="speed" title="Playback speed (steps per second): click to change">
                      {speed}×
                    </button>
                    {!textOnly && (
                      <ControlButton label="Show where the action landed (M)" onClick={() => setMarker((v) => !v)} active={marker}>
                        <Crosshair size={15} />
                      </ControlButton>
                    )}
                    <ControlButton
                      label="Copy a link to this step"
                      onClick={async () => {
                        await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?step=${step.n}`).catch(() => {});
                        toast(`Link to step ${step.n} copied`);
                      }}
                    >
                      <Link2 size={15} />
                    </ControlButton>
                    <ControlButton label="Keyboard shortcuts (?)" onClick={() => setHelp(true)}>
                      <Keyboard size={15} />
                    </ControlButton>
                  </div>
                </div>
                <div className="player-compact">
                  {run?.durationSec ? (
                    <div className="player-compact-time">
                      <Clock size={13} /> Run time {fmtHours(run.durationSec)} ({fmtDuration(run.durationSec)})
                    </div>
                  ) : null}
                  {moment && <div>{moment.label}</div>}
                  <ActionLine action={action} compact />
                  {step.o && !textOnly && <pre className="output output-compact">{step.o}</pre>}
                  {step.t && <p className="clamp-3">{step.t}</p>}
                </div>
              </div>
            </section>

            <aside className="player-side">
              {run && (
                <dl className="player-stats">
                  <div>
                    <dt>
                      <Clock size={11} /> Run time
                    </dt>
                    <dd className="big">{run.durationSec ? fmtHours(run.durationSec) : "-"}</dd>
                    <dd className="small">{run.durationSec ? fmtDuration(run.durationSec) : "Not recorded"}</dd>
                  </div>
                  <div>
                    <dt>Steps</dt>
                    <dd className="big">{fmtInt(steps.length)}</dd>
                  </div>
                  <div>
                    <dt>Score</dt>
                    <dd>
                      <Score value={run.score} size="lg" />
                    </dd>
                  </div>
                </dl>
              )}
              <div className="side-tabs" role="tablist">
                {(
                  [
                    ["step", "Step"],
                    ["writeup", "Write-up"],
                    ["steps", "All steps"],
                  ] as [Tab, string][]
                ).map(([key, label]) => (
                  <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
                    {label}
                    {key === "steps" && <span>{fmtInt(steps.length)}</span>}
                  </button>
                ))}
              </div>
              <div className={cn("side-body", tab === "steps" && "side-body-list")}>
                {tab === "step" && (
                  <StepPanel step={step} action={action} moment={moment} events={here} cited={citations.get(step.n)} total={steps.length} index={i} textOnly={textOnly} />
                )}
                {tab === "writeup" && (
                  <div className="side-pad">
                    {writeup ? (
                      <>
                        <ReviewStatusLine status={writeup.status} />
                        <h2 className="writeup-title">{writeup.title}</h2>
                        <RichText text={writeup.body} defaultRollout={idx} className="writeup-side" />
                        {moments.length > 0 && (
                          <div className="mt-8">
                            <div className="side-label">Key moments</div>
                            {moments.map((m: KeyMoment) => (
                              <button
                                key={`${m.step}-${m.label}`}
                                onClick={() => {
                                  setPlaying(false);
                                  seekStep(m.step);
                                }}
                                className={cn("moment-button", step.n === m.step && "current")}
                              >
                                <i className={cn("tone-dot", toneClass(m.tone))} />
                                <span className="moment-step">{m.step}</span>
                                <span>{m.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="muted">No write-up has been published for this run yet.</p>
                    )}
                  </div>
                )}
                {tab === "steps" && (
                  <StepList
                    steps={steps}
                    index={i}
                    moments={momentAt}
                    citations={citations}
                    events={eventsAt}
                    onPick={(k) => {
                      setPlaying(false);
                      seek(k);
                    }}
                  />
                )}
              </div>
            </aside>
          </div>
        </div>

        <Dialog open={help} onOpenChange={setHelp}>
          <DialogContent className="dialog-sm">
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>These work anywhere in the player.</DialogDescription>
            <dl className="shortcuts">
              {(
                [
                  [["←", "→"], "Previous / next step"],
                  [["Shift", "←/→"], "Jump 10 steps"],
                  [["Space"], "Play / pause"],
                  [["N", "P"], "Next / previous key moment"],
                  [["1-9"], "Switch run"],
                  [["M"], "Show or hide the action marker"],
                  [["Home", "End"], "First / last step"],
                  [["Esc"], "Back to the deck"],
                ] as [string[], string][]
              ).map(([keys, text]) => (
                <React.Fragment key={text}>
                  <dt className="kbd-row">
                    {keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </dt>
                  <dd>{text}</dd>
                </React.Fragment>
              ))}
            </dl>
          </DialogContent>
        </Dialog>
      </StepRefContext.Provider>
    </CriteriaContext.Provider>
  );
}

function StepPanel({
  step,
  action,
  moment,
  events,
  cited,
  total,
  index,
  textOnly,
}: {
  step: Step;
  action: ParsedAction;
  moment?: KeyMoment;
  events?: WorldEvent[];
  cited?: string[];
  total: number;
  index: number;
  textOnly: boolean;
}) {
  return (
    <div className="side-pad step-panel">
      <div className="step-panel-head">
        <div className="step-panel-n">
          Step <span>{step.n}</span>
        </div>
        <span className="step-panel-of">
          {index + 1} of {fmtInt(total)}
        </span>
      </div>
      {step.c && <div className="step-panel-clock">{step.c}</div>}
      {moment && (
        <div className="step-notice">
          <i className={cn("tone-dot", toneClass(moment.tone))} />
          <span>
            <span className="muted">Key moment · </span>
            {moment.label}
          </span>
        </div>
      )}
      {events?.map((e) => (
        <div key={e.label} className="step-notice">
          <i className={cn("tone-dot", e.silent ? "event-dot-silent" : "event-dot")} />
          <span>
            <span className="muted">{e.silent ? "Silent world event · " : "World event · "}</span>
            {e.label} <span className="faint">· {e.time}</span>
          </span>
        </div>
      ))}
      <div>
        <div className="side-label">Action</div>
        <ActionLine action={action} />
        {step.r && <p className="action-result">→ {step.r}</p>}
        {step.x && <p className="action-error">✕ {step.x}</p>}
        {step.o && (
          <>
            <div className="side-label output-label">Output</div>
            <pre className="output">{step.o}</pre>
          </>
        )}
        <details className="raw">
          <summary>Raw</summary>
          <code>{step.a}</code>
        </details>
      </div>
      <div>
        <div className="side-label">Reasoning</div>
        {step.t ? <p className="reasoning">{step.t}</p> : <p className="muted">No reasoning was recorded for this step.</p>}
      </div>
      {cited && cited.length > 0 && (
        <div>
          <div className="side-label">Cited in</div>
          <ul className="cited-list">
            {[...new Set(cited)].map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="caption">
        {textOnly ? "The output is what the agent got back from this step." : "The screenshot shows the screen after this step; the marker shows where the action landed."}
      </p>
    </div>
  );
}
