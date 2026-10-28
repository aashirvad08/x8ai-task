"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Share2, Upload } from "lucide-react";
import { ModelDot } from "@/components/marks";
import { ScoresCard, ScoreSheet } from "@/components/scores";
import { fmtInt, pad2 } from "@/lib/format";
import { useRoutes } from "@/components/view";
import type { SheetPayload, SheetTask } from "@/lib/types";
import { cn } from "@/lib/utils";

type TabKey = "summary" | "tasks" | "runs";

function TaskEntry({ t, i, models }: { t: SheetTask; i: number; models: string[] }) {
  const routes = useRoutes();
  return (
    <li>
      <Link href={routes.task(t.id)} className="task-entry">
        <span className="task-entry-num">{pad2(i + 1)}</span>
        <div className="task-entry-body">
          <p className="meta-line mb-0">
            <span>{t.code}</span>
            {t.domain && <span>{t.domain}</span>}
            {t.status === "draft" && <span className="draft-tag">Draft</span>}
          </p>
          <h2>{t.name}</h2>
          {t.headline && <p className="task-entry-headline">{t.headline}</p>}
          <div className="task-entry-models">
            {models.map((m) => {
              const rs = t.runs.filter((r) => r.model === m);
              if (!rs.length) return null;
              const passes = rs.filter((r) => r.completed).length;
              const ach = rs.reduce((a, r) => a + r.achievement, 0) / rs.length;
              return (
                <React.Fragment key={m}>
                  <span className="model-name">
                    <ModelDot model={m} all={models} />
                    {m}
                  </span>
                  <span className="task-entry-score">
                    <b>{ach.toFixed(3)}</b> criteria · <span className={cn(passes > 0 && "tone-pass")}>{passes}/{rs.length}</span> passed
                  </span>
                </React.Fragment>
              );
            })}
          </div>
          <span className="task-entry-foot">
            {t.runs.length} runs · {t.blockers} blockers
            <span className="task-entry-open">
              Open <ArrowRight size={14} />
            </span>
          </span>
        </div>
      </Link>
    </li>
  );
}

// A lab's tasks: published ones with their calibration scores, then drafts that only the lab can see.
// canShare: the viewer may make share links (lab owners and the site admin). Under a share link there is no uploading
// or sharing, and only published tasks.
export function Overview({ payload, canShare = false }: { payload: SheetPayload; canShare?: boolean }) {
  const routes = useRoutes();
  const [sheet, setSheet] = React.useState<TabKey | null>(null);
  const sharingHref = canShare ? `/labs/${payload.lab.slug}/sharing` : undefined;
  const published = React.useMemo(() => ({ ...payload, tasks: payload.tasks.filter((t) => t.status === "published") }), [payload]);
  const drafts = payload.tasks.filter((t) => t.status === "draft");
  const runs = published.tasks.reduce((n, t) => n + t.runs.length, 0);
  const steps = published.tasks.reduce((n, t) => n + t.steps, 0);
  return (
    <>
      <section className="overview-hero">
        <div className="overview-intro">
          <p className="eyebrow">{routes.shared ? `${payload.lab.name} · task review` : "Task review"}</p>
          <h1>{payload.title}</h1>
          {payload.description && <p>{payload.description}</p>}
          <div className="overview-counts">
            <span>
              <strong>{published.tasks.length}</strong> {published.tasks.length === 1 ? "task" : "tasks"}
            </span>
            <span>
              <strong>{fmtInt(runs)}</strong> runs
            </span>
            <span>
              <strong>{fmtInt(steps)}</strong> recorded steps
            </span>
          </div>
          {!routes.shared && (
            <div className="overview-actions">
              <Link href={`/labs/${payload.lab.slug}/upload`} className="button button-outline button-sm">
                <Upload size={13} /> Upload tasks
              </Link>
              {sharingHref && (
                <Link href={sharingHref} className="button button-outline button-sm">
                  <Share2 size={13} /> Share
                </Link>
              )}
            </div>
          )}
        </div>
        {published.tasks.length > 0 && <ScoresCard payload={published} onOpen={(tab) => setSheet(tab ?? "summary")} />}
      </section>

      {drafts.length > 0 && (
        <>
          <h2 className="eyebrow overview-label">Drafts · only your lab can see these</h2>
          <ol className="task-list">
            {drafts.map((t, i) => (
              <TaskEntry key={t.id} t={t} i={i} models={payload.models} />
            ))}
          </ol>
        </>
      )}

      <h2 className="eyebrow overview-label">Tasks</h2>
      {published.tasks.length === 0 && routes.shared && (
        <div className="empty-state">
          <strong>No tasks here yet</strong>
          <p>The tasks shared through this link will appear here once they&apos;re published.</p>
        </div>
      )}
      {published.tasks.length === 0 && !routes.shared && (
        <div className="empty-state">
          <strong>No published tasks yet</strong>
          <p>
            {drafts.length
              ? "Open a draft and publish it when it's ready."
              : "Upload a package of tasks and their runs; each arrives as a draft you can check before publishing."}
          </p>
          <Link href={`/labs/${payload.lab.slug}/upload`} className="button button-primary button-sm">
            <Upload size={13} /> Upload tasks
          </Link>
        </div>
      )}
      <ol className="task-list">
        {published.tasks.map((t, i) => (
          <TaskEntry key={t.id} t={t} i={i} models={payload.models} />
        ))}
      </ol>
      {published.tasks.length > 0 && (
        <ScoreSheet open={sheet !== null} initialTab={sheet ?? "summary"} onClose={() => setSheet(null)} payload={published} sharingHref={sharingHref} />
      )}
    </>
  );
}
