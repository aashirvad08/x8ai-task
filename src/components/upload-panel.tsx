"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Copy, Download, FileArchive, FolderOpen, LoaderCircle, TriangleAlert, Upload } from "lucide-react";
import { useToast } from "@/components/toast";
import { filesFromFolder, filesFromZip, type PkgFile } from "@/lib/package/files";
import { inspectPackage, type PlannedTask } from "@/lib/package/inspect";
import { uploadTask, type UploadPhase, type UploadResult } from "@/lib/package/upload";
import { fmtInt } from "@/lib/format";
import { taskHref } from "@/lib/routes";
import type { LabRef } from "@/lib/types";
import { cn } from "@/lib/utils";

type Existing = Record<string, { id: string; name: string; status: "draft" | "published" }>;
type Progress = { phase: UploadPhase; done: number; total: number } | { result: UploadResult } | { error: string };

const KIND = { gui: "Computer-use", terminal: "Command-line", tool: "Tool / API" } as const;
const PHASE: Record<UploadPhase, string> = {
  reading: "Reading screenshots",
  screenshots: "Sending new screenshots",
  steps: "Sending steps",
  saving: "Saving the task",
};

function PromptTools() {
  const toast = useToast();
  const fullPrompt = async () => {
    const [prompt, checker] = await Promise.all([fetch("/tools/packaging-prompt.md").then((r) => r.text()), fetch("/tools/check_package.py").then((r) => r.text())]);
    return `${prompt}\n\`\`\`python\n${checker}\`\`\`\n`;
  };
  return (
    <section className="upload-card">
      <div className="upload-card-head">
        <span className="upload-num">1</span>
        <div>
          <h2>Package your runs</h2>
          <p>
            Paste this prompt into Claude or another LLM that can read your files. It asks what kind of agent the task is for (computer-use, command-line or tool /
            API), builds the folders this page expects, writes the deck and the run write-ups, and checks everything before zipping.
          </p>
        </div>
      </div>
      <div className="upload-actions">
        <button
          className="button button-primary button-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(await fullPrompt());
              toast("Packaging prompt copied, with the checker script at the end");
            } catch {
              toast("Couldn't copy the prompt. Download it instead.", "error");
            }
          }}
        >
          <Copy size={13} /> Copy packaging prompt
        </button>
        <button
          className="button button-outline button-sm"
          onClick={async () => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([await fullPrompt()], { type: "text/markdown" }));
            a.download = "run-deck-packaging-prompt.md";
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          }}
        >
          <Download size={13} /> Download prompt
        </button>
        <a className="button button-ghost button-sm" href="/tools/check_package.py" download>
          <Download size={13} /> Checker only (check_package.py)
        </a>
      </div>
    </section>
  );
}

function TaskReportRow({ planned, existing, progress }: { planned: PlannedTask; existing?: Existing[string]; progress?: Progress }) {
  const r = planned.report;
  const models = new Map<string, number[]>();
  for (const run of r.runs) models.set(run.model ?? "?", [...(models.get(run.model ?? "?") ?? []), run.idx]);
  const steps = r.runs.reduce((n, x) => n + x.steps, 0);
  const shots = r.runs.reduce((n, x) => n + x.screenshots, 0);
  const outputs = r.runs.reduce((n, x) => n + x.observations, 0);
  const [open, setOpen] = React.useState(false);
  return (
    <li className={cn("pkg-task", r.errors.length && "has-errors")}>
      <div className="pkg-task-head">
        <div className="min-w-0">
          <div className="pkg-task-name">
            {r.errors.length ? <CircleAlert size={15} className="tone-fail" /> : <CircleCheck size={15} className="tone-pass" />}
            <strong>{r.name}</strong>
            <span className="mono faint">{r.folder}</span>
          </div>
          <div className="pkg-task-meta">
            {KIND[r.modality]} · {[...models].map(([m, runs]) => `${m} runs ${runs.join(", ")}`).join(" · ")} · {fmtInt(steps)} steps
            {shots ? ` · ${fmtInt(shots)} screenshots` : ""}
            {outputs ? ` · ${fmtInt(outputs)} outputs` : ""} · {r.failureModes} failure modes · {r.writeups} run write-ups
          </div>
          {existing && (
            <div className="pkg-replace">
              Replaces <b>{existing.name}</b> ({existing.status === "published" ? "published; the new version goes live as soon as it's uploaded" : "draft"}).
            </div>
          )}
        </div>
        {progress && <ProgressCell progress={progress} />}
      </div>
      {r.errors.length > 0 && (
        <ul className="pkg-issues pkg-errors">
          {r.errors.slice(0, 12).map((e, i) => (
            <li key={i}>{e}</li>
          ))}
          {r.errors.length > 12 && <li>…and {r.errors.length - 12} more errors</li>}
        </ul>
      )}
      {r.warnings.length > 0 && (
        <div className="pkg-warnings">
          <button onClick={() => setOpen((v) => !v)}>
            <TriangleAlert size={13} /> {r.warnings.length} warning{r.warnings.length === 1 ? "" : "s"} {open ? "(hide)" : "(show)"}
          </button>
          {open && (
            <ul className="pkg-issues">
              {r.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function ProgressCell({ progress }: { progress: Progress }) {
  if ("error" in progress) return <span className="pkg-state tone-fail">Failed: {progress.error}</span>;
  if ("result" in progress)
    return (
      <span className="pkg-state">
        <CircleCheck size={14} className="tone-pass" /> {progress.result.replaced ? "Replaced" : "Uploaded"} ·{" "}
        <Link href={taskHref(progress.result.task)} className="admin-link">
          Open {progress.result.status === "draft" ? "draft" : "task"}
        </Link>
      </span>
    );
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <span className="pkg-state">
      <LoaderCircle size={14} className="spin" /> {PHASE[progress.phase]}
      {progress.total > 1 && ` ${fmtInt(progress.done)}/${fmtInt(progress.total)}`}
      <span className="pkg-bar">
        <i style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

export function UploadPanel({ lab, existing }: { lab: LabRef; existing: Existing }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<string | null>(null);
  const [planned, setPlanned] = React.useState<PlannedTask[]>([]);
  const [progress, setProgress] = React.useState<Record<string, Progress>>({});
  const [uploading, setUploading] = React.useState(false);
  const [drag, setDrag] = React.useState(false);
  const zipInput = React.useRef<HTMLInputElement>(null);
  const folderInput = React.useRef<HTMLInputElement>(null);

  const load = async (label: string, read: () => Promise<PkgFile[]>) => {
    setProblem(null);
    setPlanned([]);
    setProgress({});
    setSource(label);
    setBusy("Opening the package…");
    try {
      const files = await read();
      setBusy("Checking it…");
      const { tasks, problems } = await inspectPackage(files);
      if (problems.length) setProblem(problems.join(" "));
      setPlanned(tasks);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const pickZip = (file?: File) => file && load(file.name, () => filesFromZip(file));

  const ready = planned.filter((p) => !p.report.errors.length);
  const blocked = planned.length - ready.length;
  const finished = Object.values(progress).filter((p) => "result" in p).length;

  const upload = async () => {
    setUploading(true);
    for (const p of ready) {
      const key = p.report.folder;
      try {
        const result = await uploadTask(lab.id, p, (phase, done, total) => setProgress((s) => ({ ...s, [key]: { phase, done, total } })));
        setProgress((s) => ({ ...s, [key]: { result } }));
      } catch (e) {
        setProgress((s) => ({ ...s, [key]: { error: (e as Error).message } }));
      }
    }
    setUploading(false);
    router.refresh();
  };

  return (
    <div className="upload">
      <div className="admin-head">
        <p className="eyebrow">{lab.name}</p>
        <h1>Upload tasks</h1>
        <p>
          A package holds one or more tasks with their runs. New tasks arrive as drafts that only your lab can see; publish each one when it&apos;s ready.
          A task folder your lab already has replaces that task.
        </p>
      </div>

      <PromptTools />

      <section className="upload-card">
        <div className="upload-card-head">
          <span className="upload-num">2</span>
          <div>
            <h2>Choose the package</h2>
            <p>The zip the prompt made, or the folder before zipping. It&apos;s checked here in your browser before anything is sent.</p>
          </div>
        </div>
        <div
          className={cn("dropzone", drag && "over")}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f && f.name.toLowerCase().endsWith(".zip")) pickZip(f);
            else setProblem("Drop a .zip file here, or use “Choose folder” for a folder.");
          }}
        >
          <FileArchive size={22} />
          <p>Drop a .zip here</p>
          <div className="upload-actions">
            <button className="button button-outline button-sm" onClick={() => zipInput.current?.click()} disabled={uploading}>
              <FileArchive size={13} /> Choose .zip
            </button>
            <button className="button button-outline button-sm" onClick={() => folderInput.current?.click()} disabled={uploading}>
              <FolderOpen size={13} /> Choose folder
            </button>
          </div>
          <input ref={zipInput} type="file" accept=".zip,application/zip" hidden onChange={(e) => pickZip(e.target.files?.[0] ?? undefined)} />
          <input
            ref={folderInput}
            type="file"
            hidden
            multiple
            {...({ webkitdirectory: "" } as Record<string, string>)}
            onChange={(e) => {
              const list = e.target.files;
              if (list?.length) load(`${(list[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split("/")[0] ?? "folder"}/`, async () => filesFromFolder(list));
            }}
          />
        </div>
        {busy && (
          <p className="upload-status">
            <LoaderCircle size={14} className="spin" /> {busy}
          </p>
        )}
        {problem && <p className="form-error">{problem}</p>}
      </section>

      {planned.length > 0 && (
        <section className="upload-card">
          <div className="upload-card-head">
            <span className="upload-num">3</span>
            <div>
              <h2>
                {source}: {planned.length} task{planned.length === 1 ? "" : "s"}
              </h2>
              <p>
                {blocked
                  ? `${blocked} task${blocked === 1 ? " has" : "s have"} errors and will be skipped; fix ${blocked === 1 ? "it" : "them"} and choose the package again.`
                  : "Everything checks out."}
              </p>
            </div>
          </div>
          <ul className="pkg-list">
            {planned.map((p) => (
              <TaskReportRow key={p.report.folder} planned={p} existing={existing[p.report.folder]} progress={progress[p.report.folder]} />
            ))}
          </ul>
          <div className="upload-foot">
            {finished > 0 && !uploading ? (
              <Link href={`/labs/${lab.slug}`} className="button button-primary button-sm">
                Back to {lab.name}
              </Link>
            ) : (
              <button className="button button-primary button-sm" disabled={!ready.length || uploading} onClick={upload}>
                {uploading ? <LoaderCircle size={13} className="spin" /> : <Upload size={13} />}
                {uploading ? "Uploading…" : `Upload ${ready.length} task${ready.length === 1 ? "" : "s"}`}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
