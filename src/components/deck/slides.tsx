"use client";

import * as React from "react";
import { ArrowRight, ArrowUpRight, Clock } from "lucide-react";
import { CaughtDots, CheckGlyph, CritRef, MetaItems, ModelName, ReviewStatusLine, RunChip, Score, toneClass, type CheckState } from "@/components/marks";
import { RichText, StepRefContext } from "@/components/rich-text";
import {
  ATTRIBUTION,
  SEVERITY,
  blockerKind,
  blockerOrigin,
  fmtDuration,
  fmtHours,
  fmtInt,
  fmtScore,
  pad2,
} from "@/lib/format";
import type { KeyMoment, Rollout, Task } from "@/lib/types";
import { cn } from "@/lib/utils";

export type OpenRun = (idx: number, step?: number) => void;

const modelsOf = (t: Task) => t.rollouts.map((r) => r.model);

export function Section({ label, aside, className, children }: { label: string; aside?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("slide-section", className)}>
      <div className="slide-section-head">
        <h2 className="eyebrow">{label}</h2>
        {aside && <div className="slide-section-aside">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export function Row({ label, className, children }: { label: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("slide-row", className)}>
      <div className="slide-row-label">{label}</div>
      <div className="slide-row-body">{children}</div>
    </div>
  );
}

// 01 Overview
export function OverviewSlide({ task, onRun }: { task: Task; onRun: OpenRun }) {
  const all = modelsOf(task);
  const full = task.rollouts.filter((r) => r.score >= 1).length;
  return (
    <div>
      <Section label="At a glance">
        <Row label="Task">
          <span className="mono-ink">{task.code}</span>
          {task.sourceTraceId && <span className="faint"> · source trace {task.sourceTraceId}</span>}
        </Row>
        {task.domain && <Row label="Domain">{task.domain}</Row>}
        {task.doc.apps.length > 0 && <Row label="Apps">{task.doc.apps.map((a) => a.name).join(", ")}</Row>}
        <Row label="Recorded">
          {task.rollouts.length} runs · {fmtInt(task.stats.steps)} steps · {task.doc.blockers.length} designed blockers · {task.doc.criteria.length} graded checks
        </Row>
      </Section>
      <Section label="Outcome" aside={`${full} of ${task.rollouts.length} runs passed in full`}>
        <div className="outcome-rows">
          {task.stats.models.map((m) => (
            <div key={m.model} className="outcome-row">
              <ModelName model={m.model} all={all} />
              <span className="outcome-runs">
                {task.rollouts
                  .filter((r) => r.model === m.model)
                  .map((r) => (
                    <button key={r.idx} onClick={() => onRun(r.idx)} className="outcome-run" title={`Open run ${r.idx}`}>
                      <span>R{r.idx}</span>
                      <Score value={r.score} />
                    </button>
                  ))}
              </span>
              <span className="outcome-sum">
                passed {m.passes}/{m.n} · mean {fmtScore(m.mean)}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// 02 The task
export function DetailsSlide({ task }: { task: Task }) {
  const { doc } = task;
  return (
    <div>
      <Section label="Task instruction" aside="exactly what the agent was told">
        <blockquote className="instruction">{doc.instruction || "No instruction was packaged with this task."}</blockquote>
      </Section>
      {doc.apps.length > 0 && (
        <Section label="Apps the agent works in" className="mt-wide">
          {doc.apps.map((a) => (
            <Row key={a.name} label={<span className="ink">{a.name}</span>}>
              {a.role}
            </Row>
          ))}
        </Section>
      )}
      {doc.details.length > 0 && (
        <Section label="Details" className="mt-wide">
          {doc.details.map((d) => (
            <Row key={d.title} label={<span className="ink strong">{d.title}</span>} className="slide-row-roomy">
              <RichText text={d.body} />
            </Row>
          ))}
        </Section>
      )}
    </div>
  );
}

// Objectives get a grey each, darkest first, so the share bar and the list read together.
const SHADES = [100, 78, 60, 46, 34, 24, 16];
const shade = (i: number) => `color-mix(in srgb, var(--foreground) ${SHADES[i % SHADES.length]}%, var(--background))`;

// 03 Grading
export function GradingSlide({ task }: { task: Task }) {
  const objectives = task.doc.criteria.filter((c) => c.kind === "objective");
  const guardrails = task.doc.criteria.filter((c) => c.kind === "guardrail");
  const total = objectives.reduce((a, c) => a + c.weight, 0) || 1;
  return (
    <div>
      <Section label="Objectives" aside="share of the score">
        <div className="share-bar">
          {objectives.map((c, i) => (
            <div key={c.id} title={`${c.label}: ${Math.round((c.weight / total) * 100)}%`} style={{ width: `${(c.weight / total) * 100}%`, background: shade(i) }} />
          ))}
        </div>
        {objectives.map((c, i) => (
          <div key={c.id} className="slide-row">
            <span className="share">
              <i style={{ background: shade(i) }} />
              <b>{Math.round((c.weight / total) * 100)}</b>
              <small>%</small>
            </span>
            <div>
              <div className="check-label">{c.label}</div>
              <div className="check-explain">{c.explain ?? c.description}</div>
            </div>
          </div>
        ))}
      </Section>
      {guardrails.length > 0 && (
        <Section label="Guardrails" aside="breaking one sets the run to zero" className="mt-wide">
          {guardrails.map((c) => (
            <div key={c.id} className="slide-row">
              <span className="gate">Gate</span>
              <div>
                <div className="check-label">{c.label}</div>
                <div className="check-explain">{c.explain ?? c.description}</div>
              </div>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

// 04 Blockers
export function BlockersSlide({ task, onBlocker }: { task: Task; onBlocker: (i: number) => void }) {
  return (
    <div className="ruled">
      {task.doc.blockers.map((b, i) => (
        <button key={b.id} onClick={() => onBlocker(i)} className="list-row blocker-row">
          <span className="list-num">{pad2(i + 1)}</span>
          <span className="min-w-0">
            <span className="list-title">{b.title}</span>
            <MetaItems items={[blockerKind(b.kind), blockerOrigin(b.origin)]} />
          </span>
          <span className="list-end">
            <CaughtDots caught={b.caught ?? []} runs={task.rollouts} />
            <ArrowRight size={15} className="list-arrow" />
          </span>
        </button>
      ))}
    </div>
  );
}

export function BlockerSlide({ task, index, onRun }: { task: Task; index: number; onRun: OpenRun }) {
  const b = task.doc.blockers[index];
  const all = modelsOf(task);
  const crit = new Map(task.doc.criteria.map((c) => [c.id, c]));
  const panels: [string, string][] = [
    ["What the agent sees", b.whatAgentSees],
    ["Why it's hard", b.whyHard],
    ["The right path", b.rightPath],
    ["What a wrong move costs", b.wrongMove],
  ];
  return (
    <div>
      <div className="panels">
        {panels.map(([label, text]) => (
          <div key={label} className="panel">
            <div className="eyebrow">{label}</div>
            <RichText text={text} />
          </div>
        ))}
      </div>
      <div className="mt-2">
        <Row label="Guards">
          <span className="chip-row">
            {b.criteria.length === 0 && <span className="muted">No graded check is tied to this blocker.</span>}
            {b.criteria.map((id) => (
              <CritRef key={id} id={id} c={crit.get(id)} />
            ))}
          </span>
        </Row>
        <Row label="Caught">
          <span className="chip-row">
            {task.rollouts.map((r) => (
              <RunChip key={r.idx} run={r} all={all} filled={b.caught?.includes(r.idx)} muted={!b.caught?.includes(r.idx)} onClick={() => onRun(r.idx)} />
            ))}
            <span className="muted ml-1">
              {b.caught?.length ?? 0} of {task.rollouts.length} runs
            </span>
          </span>
        </Row>
      </div>
    </div>
  );
}

// What the objectives alone were worth, before all-or-nothing scoring or a broken guardrail took the run to its score.
function earned(task: Task, r: Rollout) {
  const objectives = task.doc.criteria.filter((c) => c.kind === "objective");
  const total = objectives.reduce((a, c) => a + c.weight, 0) || 1;
  return objectives.reduce((a, c) => a + (r.scores[c.id] ?? 0) * c.weight, 0) / total;
}

function checkState(score: number | undefined, guard: boolean): CheckState {
  if (score === undefined) return "none";
  if (score >= 1) return "met";
  if (score > 0) return "partial";
  return guard ? "broken" : "missed";
}

const CHECK_WORDS: Record<CheckState, string> = { met: "met", partial: "partly met", missed: "missed", broken: "broken", none: "not scored" };

// Consecutive runs of the same model, for the grouped column headers.
function byModel(rs: Rollout[]) {
  const groups: { model: string; runs: Rollout[] }[] = [];
  for (const r of rs) {
    const last = groups[groups.length - 1];
    if (last && last.model === r.model) last.runs.push(r);
    else groups.push({ model: r.model, runs: [r] });
  }
  return groups;
}

// 05 Outcomes: results
export function ResultsSlide({ task, onRun }: { task: Task; onRun: OpenRun }) {
  const all = modelsOf(task);
  const runs = task.rollouts;
  const objectives = task.doc.criteria.filter((c) => c.kind === "objective");
  const guardrails = task.doc.criteria.filter((c) => c.kind === "guardrail");
  const total = objectives.reduce((a, c) => a + c.weight, 0) || 1;
  const anyDashed = runs.some((r) => earned(task, r) > r.score);
  return (
    <div>
      <Section label="Score by run" aside={anyDashed ? "dashed: what the objectives earned before the run was zeroed" : undefined}>
        {runs.map((r) => {
          const zeroed = r.hardZero.length > 0;
          const pre = earned(task, r);
          return (
            <button key={r.idx} onClick={() => onRun(r.idx)} className="score-row">
              <span className="score-row-idx">R{r.idx}</span>
              <span className="score-row-model">
                <ModelName model={r.model} all={all} />
              </span>
              <span className="score-track">
                {pre > r.score && <span className="score-pre" style={{ width: `${pre * 100}%` }} />}
                <span className="score-fill" style={{ width: `${(r.score ?? 0) * 100}%` }} />
              </span>
              <Score value={r.score} />
              <span className="score-row-end">
                {zeroed ? <span className="tone-fail" title={`Guardrail broken: ${r.hardZero.join(", ")}`}>zeroed</span> : `${fmtInt(r.steps)} steps`}
              </span>
            </button>
          );
        })}
      </Section>
      <Section
        label="Every check, every run"
        className="mt-wide"
        aside={
          <span className="check-legend">
            {(["met", "partial", "missed", "broken"] as CheckState[]).map((s) => (
              <span key={s}>
                <CheckGlyph state={s} /> {s === "broken" ? "guardrail broken" : s === "partial" ? "partly" : s}
              </span>
            ))}
          </span>
        }
      >
        <div className="matrix-scroll">
          <table className="matrix">
            <thead>
              <tr>
                <th />
                <th />
                {byModel(runs).map((g) => (
                  <th key={`${g.model}-${g.runs[0].idx}`} colSpan={g.runs.length} className="matrix-group">
                    <span>
                      <ModelName model={g.model} all={all} />
                    </span>
                  </th>
                ))}
              </tr>
              <tr>
                <th className="matrix-check">Check</th>
                <th className="matrix-weight">Weight</th>
                {runs.map((r) => (
                  <th key={r.idx} className="matrix-run">
                    <button onClick={() => onRun(r.idx)} title={r.model}>
                      R{r.idx}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...objectives.map((c) => ({ c, guard: false })), ...guardrails.map((c) => ({ c, guard: true }))].map(({ c, guard }, k) => (
                <tr key={c.id} className={cn(guard && k === objectives.length && "matrix-first-guard")}>
                  <td title={c.explain ?? c.description ?? undefined} className={cn("matrix-label", guard && "muted")}>
                    {c.label}
                  </td>
                  <td className={cn("matrix-w", guard && "tone-fail")}>{guard ? "gate" : `${Math.round((c.weight / total) * 100)}%`}</td>
                  {runs.map((r) => {
                    const v = r.scores[c.id];
                    const s = checkState(v, guard);
                    return (
                      <td key={r.idx} className="matrix-cell">
                        <button onClick={() => onRun(r.idx)} title={`R${r.idx}: ${s === "partial" ? `partly met (${fmtScore(v)})` : CHECK_WORDS[s]}`}>
                          <CheckGlyph state={s} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="matrix-total">
                <td>Score</td>
                <td />
                {runs.map((r) => (
                  <td key={r.idx}>
                    <Score value={r.score} size="sm" />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// 05 Outcomes: failure modes
export function FailureModesSlide({ task, onRun }: { task: Task; onRun: OpenRun }) {
  const crit = new Map(task.doc.criteria.map((c) => [c.id, c]));
  const all = modelsOf(task);
  return (
    <div className="ruled">
      {task.failureModes.map((f, i) => (
        <article key={f.id} className="failure">
          <span className="list-num list-num-lg">{pad2(i + 1)}</span>
          <div className="min-w-0">
            <MetaItems
              items={[
                <span key="s" className={cn(f.severity === "critical" && "tone-fail")}>
                  {SEVERITY[f.severity] ?? f.severity}
                </span>,
                ATTRIBUTION[f.attribution] ?? f.attribution,
                <ReviewStatusLine key="r" status={f.status} />,
              ]}
            />
            <h3 className="failure-title">{f.title}</h3>
            <RichText text={f.summary} className="failure-summary" />
            <div className="failure-foot">
              <span className="chip-row">
                <span className="muted">Seen in</span>
                {task.rollouts
                  .filter((r) => f.rollouts.includes(r.idx))
                  .map((r) => (
                    <RunChip key={r.idx} run={r} all={all} onClick={() => onRun(r.idx)} />
                  ))}
              </span>
              {f.criteria.length > 0 && (
                <span className="chip-row">
                  <span className="muted">Cost</span>
                  {f.criteria.map((id) => (
                    <CritRef key={id} id={id} c={crit.get(id)} />
                  ))}
                </span>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

// A run's key moments along its length: green went right, red went wrong.
export function MomentStrip({ moments, steps, onPick }: { moments: KeyMoment[]; steps: number; onPick?: (m: KeyMoment) => void }) {
  return (
    <div className="moment-strip">
      <i />
      {moments.map((m) => (
        <button
          key={`${m.step}-${m.label}`}
          title={`Step ${m.step}: ${m.label}`}
          className={toneClass(m.tone)}
          style={{ left: `${Math.min(100, (m.step / Math.max(1, steps)) * 100)}%` }}
          onClick={(e) => {
            e.stopPropagation();
            onPick?.(m);
          }}
        />
      ))}
    </div>
  );
}

function RunTime({ sec }: { sec: number | null }) {
  return sec ? (
    <span className="runtime-pill" title={`Agent run time: ${fmtDuration(sec)}`}>
      <Clock size={13} />
      {fmtHours(sec)}
    </span>
  ) : (
    <span className="runtime-none">
      <Clock size={13} /> No run time
    </span>
  );
}

// 06 Runs
export function RunsSlide({ task, onRun }: { task: Task; onRun: OpenRun }) {
  const all = modelsOf(task);
  return (
    <div className="ruled">
      {task.rollouts.map((r) => {
        const w = task.writeups.find((x) => x.rollout === r.idx);
        return (
          <div
            key={r.idx}
            role="button"
            tabIndex={0}
            onClick={() => onRun(r.idx)}
            onKeyDown={(e) => e.key === "Enter" && onRun(r.idx)}
            className="list-row run-row"
          >
            <span className="list-idx">R{r.idx}</span>
            <div className="min-w-0">
              <MetaItems items={[<ModelName key="m" model={r.model} all={all} />, `${fmtInt(r.steps)} steps`, <RunTime key="t" sec={r.durationSec} />]} />
              <div className="run-row-title">{w?.title ?? "No write-up yet"}</div>
              {w && w.keyMoments.length > 0 && <MomentStrip moments={w.keyMoments} steps={r.steps} onPick={(m) => onRun(r.idx, m.step)} />}
            </div>
            <Score value={r.score} size="lg" />
          </div>
        );
      })}
    </div>
  );
}

export function RunKicker({ task, r }: { task: Task; r: Rollout }) {
  const w = task.writeups.find((x) => x.rollout === r.idx);
  return (
    <MetaItems
      items={[
        `Run ${r.idx}`,
        <ModelName key="m" model={r.model} all={modelsOf(task)} />,
        `${fmtInt(r.steps)} steps`,
        r.durationSec ? (
          <span key="d" title={`Agent run time: ${fmtDuration(r.durationSec)}`}>
            {fmtHours(r.durationSec)}
          </span>
        ) : null,
        <Score key="s" value={r.score} size="sm" />,
        w ? <ReviewStatusLine key="r" status={w.status} /> : null,
      ]}
    />
  );
}

export function RunSlide({ task, idx, onRun }: { task: Task; idx: number; onRun: OpenRun }) {
  const r = task.rollouts.find((x) => x.idx === idx) as Rollout;
  const w = task.writeups.find((x) => x.rollout === idx);
  const { onStep } = React.useContext(StepRefContext);
  const missed = task.doc.criteria.filter((c) => (r.scores[c.id] ?? 1) < 1);
  return (
    <div className="run-slide">
      <div className="min-w-0">
        {w ? (
          <RichText text={w.body} defaultRollout={idx} className="writeup-body" />
        ) : (
          <p className="muted">No write-up has been published for this run yet. You can still step through it in the player.</p>
        )}
        {missed.length > 0 && (
          <Section label="Checks this run missed" className="mt-wide">
            <div className="chip-row chip-row-loose">
              {missed.map((c) => (
                <CritRef key={c.id} id={c.id} c={c} />
              ))}
            </div>
          </Section>
        )}
      </div>
      <aside className="run-aside">
        <dl className="run-stats">
          <dt className="eyebrow">Score</dt>
          <dd>
            <Score value={r.score} size="xl" />
          </dd>
          <div className="run-stats-pair">
            <div>
              <dt className="eyebrow">Steps</dt>
              <dd className="run-stat">{fmtInt(r.steps)}</dd>
            </div>
            <div>
              <dt className="eyebrow" title="How long the agent ran, start to finish">
                <Clock size={12} /> Run time
              </dt>
              {r.durationSec ? (
                <>
                  <dd className="run-stat">{fmtHours(r.durationSec)}</dd>
                  <dd className="run-stat-sub">{fmtDuration(r.durationSec)}</dd>
                </>
              ) : (
                <dd className="run-stat-sub">Not recorded</dd>
              )}
            </div>
          </div>
          {r.span?.[0] && (
            <div>
              <dt className="eyebrow">In-world time</dt>
              <dd className="run-stat-sub">
                {r.span[0]} → {r.span[1]}
              </dd>
            </div>
          )}
        </dl>
        <button onClick={() => onRun(idx)} className="play-all">
          Play all {fmtInt(r.steps)} steps <ArrowUpRight size={15} />
        </button>
        {w && w.keyMoments.length > 0 && (
          <>
            <div className="eyebrow mb-3">Key moments</div>
            <ol className="moment-list">
              {w.keyMoments.map((m) => (
                <li key={`${m.step}-${m.label}`}>
                  <button onClick={() => onStep?.({ rollout: idx, step: m.step })}>
                    <span className={cn("tone-dot", toneClass(m.tone))} />
                    <span className="moment-step">{m.step}</span>
                    <span className="moment-label">{m.label}</span>
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
        {r.events.length > 0 && (
          <>
            <div className="eyebrow mb-3 mt-6">World events</div>
            <ol className="moment-list">
              {r.events.map((e) => (
                <li key={`${e.step}-${e.label}`}>
                  <button onClick={() => onStep?.({ rollout: idx, step: e.step })} title={e.silent ? "Silent: no email was sent" : undefined}>
                    <span className={cn("tone-dot", e.silent ? "event-dot-silent" : "event-dot")} />
                    <span className="moment-step">{e.step}</span>
                    <span className="moment-label">
                      {e.label}
                      <small>{e.time}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
      </aside>
    </div>
  );
}
