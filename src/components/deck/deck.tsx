"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, PanelLeft, Play } from "lucide-react";
import { StepDialog } from "@/components/deck/step-dialog";
import { DraftBanner, TaskMenu } from "@/components/deck/task-controls";
import { LabView, useRoutes } from "@/components/view";
import {
  BlockerSlide,
  BlockersSlide,
  DetailsSlide,
  FailureModesSlide,
  GradingSlide,
  OverviewSlide,
  ResultsSlide,
  RunKicker,
  RunSlide,
  RunsSlide,
} from "@/components/deck/slides";
import { CriteriaContext, StepRefContext } from "@/components/rich-text";
import type { StepRef } from "@/lib/citations";
import { blockerKind, blockerOrigin, pad2 } from "@/lib/format";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

type Page = { key: string; title: string; short?: string; lede?: string; kicker?: React.ReactNode; render: () => React.ReactNode };
type Chapter = { key: string; title: string; pages: Page[] };
type Brief = { id: string; name: string } | null;
export type Neighbours = { index: number; count: number; prev: Brief; next: Brief };

// Older and alternative names for pages, so shared links keep working.
const ALIAS: Record<string, string> = { trace: "details", case: "details", brief: "details", task: "details", rollouts: "runs" };

function NavButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label} className="icon-round">
      {children}
    </button>
  );
}

// A task as a short deck: overview, the task, grading, blockers, outcomes and runs, one page at a time.
export function Deck({ task, nav, canDelete }: { task: Task; nav: Neighbours; canDelete: boolean }) {
  return (
    <LabView lab={task.lab.id}>
      <DeckView task={task} nav={nav} canDelete={canDelete} />
    </LabView>
  );
}

function DeckView({ task, nav, canDelete }: { task: Task; nav: Neighbours; canDelete: boolean }) {
  const routes = useRoutes();
  const params = useParams<{ slide?: string[] }>();
  const router = useRouter();
  const [stepRef, setStepRef] = React.useState<StepRef | null>(null);
  const [contents, setContents] = React.useState(true);
  const scroller = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    if (window.innerWidth < 1100) setContents(false);
  }, []);

  const openRun = React.useCallback((idx: number, step?: number) => router.push(routes.player(task.id, idx, step)), [router, task.id, routes]);

  const chapters = React.useMemo<Chapter[]>(() => {
    const list: Chapter[] = [
      {
        key: "overview",
        title: "Overview",
        pages: [{ key: "overview", title: task.name, short: "Overview", lede: task.headline ?? undefined, render: () => <OverviewSlide task={task} onRun={openRun} /> }],
      },
      {
        key: "task",
        title: "The task",
        pages: [
          {
            key: "details",
            title: "Task details",
            lede: "What the agent was told, the apps it worked in and the conditions it worked under.",
            render: () => <DetailsSlide task={task} />,
          },
        ],
      },
      {
        key: "grading",
        title: "Grading",
        pages: [
          {
            key: "grading",
            title: "How it's graded",
            lede: "A run earns points for each objective it meets. Guardrails earn nothing, but breaking any one of them sets the whole run to zero.",
            render: () => <GradingSlide task={task} />,
          },
        ],
      },
    ];
    if (task.doc.blockers.length) {
      list.push({
        key: "blockers",
        title: "Blockers",
        pages: [
          {
            key: "blockers",
            title: "Designed blockers",
            short: "All blockers",
            lede: "The obstacles built into the task on purpose. Each one guards a graded check; the dots show which runs it caught.",
            render: () => <BlockersSlide task={task} onBlocker={(i) => router.push(routes.task(task.id, `blocker-${i + 1}`))} />,
          },
          ...task.doc.blockers.map((b, i) => ({
            key: `blocker-${i + 1}`,
            title: b.title,
            kicker: `${blockerKind(b.kind)} · ${blockerOrigin(b.origin)}`,
            render: () => <BlockerSlide task={task} index={i} onRun={openRun} />,
          })),
        ],
      });
    }
    const outcomes: Page[] = [
      {
        key: "results",
        title: "Results",
        lede: "Every run against every check. Select a run to open it in the player.",
        render: () => <ResultsSlide task={task} onRun={openRun} />,
      },
    ];
    if (task.failureModes.length)
      outcomes.push({
        key: "failure-modes",
        title: "Failure modes",
        lede: "Patterns across the runs. Every claim links to the step that shows it.",
        render: () => <FailureModesSlide task={task} onRun={openRun} />,
      });
    list.push({ key: "outcomes", title: "Outcomes", pages: outcomes });
    list.push({
      key: "runs",
      title: "Runs",
      pages: [
        {
          key: "runs",
          title: "The runs",
          short: "All runs",
          lede: "One line per run with its verdict. Dots mark key moments: green went right, red went wrong.",
          render: () => <RunsSlide task={task} onRun={openRun} />,
        },
        ...task.rollouts.map((r) => ({
          key: `run-${r.idx}`,
          title: task.writeups.find((w) => w.rollout === r.idx)?.title ?? `Run ${r.idx}`,
          short: `Run ${r.idx}`,
          kicker: <RunKicker task={task} r={r} />,
          render: () => <RunSlide task={task} idx={r.idx} onRun={openRun} />,
        })),
      ],
    });
    return list;
  }, [task, openRun, router, routes]);

  const pages = React.useMemo(() => chapters.flatMap((c, ci) => c.pages.map((p, pi) => ({ ...p, chapter: c, ci, pi }))), [chapters]);
  const raw = params.slide?.[0];
  const wanted = raw ? (ALIAS[raw] ?? raw.replace(/^rollout-/, "run-")) : "overview";
  const at = Math.max(0, pages.findIndex((p) => p.key === wanted));
  const page = pages[at];
  const prev = pages[at - 1];
  const next = pages[at + 1];
  const go = React.useCallback((i: number) => router.push(routes.task(task.id, pages[Math.min(pages.length - 1, Math.max(0, i))].key)), [router, task.id, pages, routes]);
  const goTask = React.useCallback((t: Brief) => t && router.push(routes.task(t.id)), [router, routes]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (stepRef) return;
      const el = e.target as HTMLElement | null;
      if (el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable)) return;
      if (el?.closest('[role="dialog"],[role="menu"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        go(at + 1);
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        go(at - 1);
      } else if (e.key === "ArrowRight" && nav.next) {
        e.preventDefault();
        goTask(nav.next);
      } else if (e.key === "ArrowLeft" && nav.prev) {
        e.preventDefault();
        goTask(nav.prev);
      } else if (e.key === "Home") go(0);
      else if (e.key === "End") go(pages.length - 1);
      else if (e.key === "o") setContents((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, goTask, at, pages.length, stepRef, nav]);

  React.useEffect(() => {
    document.title = `${page.short ?? page.title} · ${task.name} · Run Deck`;
    scroller.current?.scrollTo({ top: 0 });
  }, [page, task.name]);

  const criteria = React.useMemo(() => new Map(task.doc.criteria.map((c) => [c.id, c])), [task.doc.criteria]);
  const num = pad2(page.ci + 1);

  return (
    <CriteriaContext.Provider value={criteria}>
      <StepRefContext.Provider value={{ onStep: setStepRef }}>
        <div className="deck fullbleed">
          <header className="deck-bar">
            <button onClick={() => setContents((v) => !v)} className={cn("icon-round contents-toggle", contents && "on")} title="Toggle contents (O)" aria-label="Toggle contents">
              <PanelLeft size={16} />
            </button>
            {nav.count > 1 && nav.index >= 0 && (
              <div className="deck-tasks">
                <NavButton label={nav.prev ? `Previous task: ${nav.prev.name} (←)` : "Previous task (←)"} onClick={() => goTask(nav.prev)} disabled={!nav.prev}>
                  <ChevronLeft size={16} />
                </NavButton>
                <span>
                  Task {nav.index + 1}/{nav.count}
                </span>
                <NavButton label={nav.next ? `Next task: ${nav.next.name} (→)` : "Next task (→)"} onClick={() => goTask(nav.next)} disabled={!nav.next}>
                  <ChevronRight size={16} />
                </NavButton>
              </div>
            )}
            <div className="deck-bar-right">
              <span className="deck-where">
                {num} {page.chapter.title}
                {page.chapter.pages.length > 1 && (
                  <span>
                    {page.pi + 1}/{page.chapter.pages.length}
                  </span>
                )}
              </span>
              <NavButton label="Previous section (↑)" onClick={() => go(at - 1)} disabled={!prev}>
                <ChevronUp size={16} />
              </NavButton>
              <NavButton label="Next section (↓)" onClick={() => go(at + 1)} disabled={!next}>
                <ChevronDown size={16} />
              </NavButton>
              {task.rollouts[0] && (
                <Link href={routes.player(task.id, task.rollouts[0].idx)} className="button button-outline button-sm">
                  <Play size={11} fill="currentColor" /> Player
                </Link>
              )}
              {!routes.shared && <TaskMenu task={task} canDelete={canDelete} />}
            </div>
            <div className="deck-progress">
              <i style={{ width: `${((at + 1) / pages.length) * 100}%` }} />
            </div>
          </header>
          <div className="deck-frame">
            {contents && (
              <nav className="deck-contents" aria-label="Contents">
                <ol>
                  {chapters.map((c, ci) => {
                    const current = ci === page.ci;
                    const first = pages.findIndex((p) => p.chapter.key === c.key);
                    return (
                      <li key={c.key}>
                        <button onClick={() => go(first)} className={cn("contents-chapter", current && "current")}>
                          <span>{pad2(ci + 1)}</span>
                          {c.title}
                        </button>
                        {current && c.pages.length > 1 && (
                          <ol className="contents-pages">
                            {c.pages.map((p, pi) => (
                              <li key={p.key}>
                                <button onClick={() => go(first + pi)} className={cn(pi === page.pi && "current")}>
                                  {p.short ?? p.title}
                                </button>
                              </li>
                            ))}
                          </ol>
                        )}
                      </li>
                    );
                  })}
                </ol>
                <p className="contents-hint">↑ ↓ move between sections. ← → switch tasks. O hides this panel.</p>
              </nav>
            )}
            <main className="deck-main" ref={scroller} data-task={task.id}>
              {task.status === "draft" && !routes.shared && <DraftBanner task={task} />}
              <article key={page.key} className="slide">
                <div className="eyebrow">
                  {num} · {page.chapter.title}
                </div>
                {page.kicker && <div className="slide-kicker">{page.kicker}</div>}
                <h1 className={cn("slide-title", page.key === "overview" && "slide-title-lg", page.kicker && "after-kicker")}>{page.title}</h1>
                {page.lede && <p className="slide-lede">{page.lede}</p>}
                <div className="slide-body">{page.render()}</div>
                <footer className="slide-foot">
                  <div>
                    {(prev || nav.prev) && (
                      <button onClick={() => (prev ? go(at - 1) : goTask(nav.prev))}>
                        <span className="eyebrow">{prev ? "Previous" : "Previous task"}</span>
                        <span className="slide-foot-link">
                          <ChevronLeft size={14} />
                          <span className="clamp-1">{prev ? (prev.short ?? prev.title) : nav.prev?.name}</span>
                        </span>
                      </button>
                    )}
                  </div>
                  <div className="text-right">
                    {(next || nav.next) && (
                      <button onClick={() => (next ? go(at + 1) : goTask(nav.next))}>
                        <span className="eyebrow">{next ? "Next" : "Next task"}</span>
                        <span className="slide-foot-link strong">
                          <span className="clamp-1">{next ? (next.short ?? next.title) : nav.next?.name}</span>
                          <ChevronRight size={14} />
                        </span>
                      </button>
                    )}
                  </div>
                </footer>
              </article>
            </main>
          </div>
        </div>
        <StepDialog task={task.id} version={task.version} target={stepRef} rollouts={task.rollouts} onClose={() => setStepRef(null)} />
      </StepRefContext.Provider>
    </CriteriaContext.Provider>
  );
}
