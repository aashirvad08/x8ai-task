"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, Copy, Download, FileSpreadsheet, Maximize2, X } from "lucide-react";
import { ModelDot } from "@/components/marks";
import { useToast } from "@/components/toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRoutes, useView } from "@/components/view";
import { buildSheet, cellText, safeFileName, toCsv, type Cell, type SheetTab } from "@/lib/sheet";
import type { SheetPayload, SheetRun } from "@/lib/types";
import { cn } from "@/lib/utils";

type TabKey = SheetTab["key"];

function useSheet(payload: SheetPayload) {
  const routes = useRoutes();
  return React.useMemo(() => {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return buildSheet(payload, {
      taskUrl: (t) => `${origin}${routes.task(t)}`,
      runUrl: (t, idx) => `${origin}${routes.player(t, idx)}`,
    });
  }, [payload, routes]);
}

// Google Sheets imports a share link's CSV, which needs no sign-in; it can't reach anything that does.
function LiveImport({ tab, sharingHref }: { tab: SheetTab; sharingHref?: string }) {
  const { share } = useView();
  const toast = useToast();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const local = /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(origin);
  if (!share)
    return (
      <>
        <h4>Open a live copy in Google Sheets</h4>
        <p>
          Live import pulls a tab into Google Sheets and keeps it up to date. It works from a share link, because Google Sheets can&apos;t sign in to your
          lab: make a share link, open it, and use this button there.
        </p>
        {sharingHref ? (
          <Link href={sharingHref} className="button button-primary formula-button">
            Make a share link
          </Link>
        ) : (
          <p className="formula-note">Ask one of your lab&apos;s owners for a share link.</p>
        )}
        <p className="formula-note">Prefer a file? Download the workbook and use File &gt; Import in Google Sheets.</p>
      </>
    );
  const formula = `=IMPORTDATA("${origin}/api/v/${share}/sheet.csv?tab=${tab.key}")`;
  return (
    <>
      <h4>Open a live copy in Google Sheets</h4>
      <p>
        A blank Google Sheet opens in a new tab. Paste into cell A1 (⌘V / Ctrl+V): the formula pulls the <b>{tab.name}</b> tab through this share link and
        keeps it up to date. It stops working if the link is revoked or expires.
      </p>
      <code className="formula" title={formula}>
        {formula}
      </code>
      {local && (
        <p className="formula-note">
          This site is running at a local address, which Google Sheets can&apos;t reach; the formula works once it&apos;s served from a public address.
        </p>
      )}
      <button
        className="button button-primary formula-button"
        onClick={async () => {
          await navigator.clipboard.writeText(formula).catch(() => {});
          window.open("https://docs.google.com/spreadsheets/create", "_blank", "noopener");
          toast("Formula copied. Paste it into cell A1 of the new sheet.");
        }}
      >
        <Copy size={13} /> Copy formula and open Google Sheets
      </button>
    </>
  );
}

const column = (n: number) => {
  let s = "";
  for (let k = n + 1; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s;
  return s;
};

function TabStrip({ tabs, active, onChange, dense }: { tabs: SheetTab[]; active: TabKey; onChange?: (k: TabKey) => void; dense?: boolean }) {
  return (
    <div className={cn("sheet-tabs", dense && "sheet-tabs-dense")}>
      {tabs.map((t) => (
        <button
          key={t.key}
          tabIndex={onChange ? 0 : -1}
          aria-pressed={t.key === active}
          onClick={(e) => {
            if (!onChange) return;
            e.stopPropagation();
            onChange(t.key);
          }}
        >
          {t.name}
        </button>
      ))}
    </div>
  );
}

const fmt3 = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : "-");

// The card on the overview: per task and model, mean criteria achievement and how many runs passed in full.
export function ScoresCard({ payload, onOpen }: { payload: SheetPayload; onOpen: (tab?: TabKey) => void }) {
  const tabs = useSheet(payload);
  const { models, tasks } = payload;
  const all = tasks.flatMap((t) => t.runs);
  const of = (runs: SheetRun[], m: string) => {
    const rs = runs.filter((r) => r.model === m);
    return { ach: rs.length ? rs.reduce((a, r) => a + r.achievement, 0) / rs.length : NaN, passed: rs.filter((r) => r.completed).length, n: rs.length };
  };
  const counts = new Set(tasks.flatMap((t) => models.map((m) => t.runs.filter((r) => r.model === m).length)));
  const measure = payload.criteria === "score" ? "the grader's task score" : "checks met ÷ all checks";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="scores-card"
      aria-label="Open the calibration scores sheet"
    >
      <div className="scores-card-head">
        <FileSpreadsheet size={16} className="sheet-icon" />
        <div className="min-w-0">
          <strong>Calibration scores</strong>
          <span>
            {tasks.length} tasks · {counts.size === 1 ? `${[...counts][0]} runs per model` : "runs per model vary"}
          </span>
        </div>
        <span className="scores-card-open">
          <Maximize2 size={12} /> Open sheet
        </span>
      </div>
      <table className="scores-table">
        <colgroup>
          <col />
          {models.flatMap((m) => [<col key={`${m}a`} className="w-criteria" />, <col key={`${m}p`} className="w-passed" />])}
        </colgroup>
        <thead>
          <tr>
            <th />
            {models.map((m) => (
              <th key={m} colSpan={2} className="model-head">
                <span>
                  <ModelDot model={m} all={models} />
                  {m}
                </span>
              </th>
            ))}
          </tr>
          <tr className="sub-head">
            <th>Task</th>
            {models.flatMap((m) => [
              <th key={`${m}a`} className="num first" title={`Mean criteria score: ${measure}, averaged over runs`}>
                Criteria
              </th>,
              <th key={`${m}p`} className="num" title="Runs that met every check">
                Passed
              </th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td title={t.name} className="task-cell">
                <span className="code">{t.code}</span>
                <span className="name">{t.name}</span>
              </td>
              {models.flatMap((m) => {
                const s = of(t.runs, m);
                return [
                  <td key={`${m}a`} className="num first" title={`Mean criteria score ${fmt3(s.ach)}: ${measure}, averaged over ${s.n} runs`}>
                    {fmt3(s.ach)}
                  </td>,
                  <td key={`${m}p`} className={cn("num", s.passed ? "tone-pass" : "faint")} title={`${s.passed} of ${s.n} runs passed every check`}>
                    {s.passed}/{s.n}
                  </td>,
                ];
              })}
            </tr>
          ))}
          <tr className="total">
            <td>All</td>
            {models.flatMap((m) => {
              const s = of(all, m);
              return [
                <td key={`${m}a`} className="num first">
                  {fmt3(s.ach)}
                </td>,
                <td key={`${m}p`} className={cn("num", s.passed && "tone-pass")}>
                  {s.passed}/{s.n}
                </td>,
              ];
            })}
          </tr>
        </tbody>
      </table>
      <p className="scores-note">
        <b>Criteria:</b> mean criteria score, {measure}, averaged over runs (1.000 = {payload.criteria === "score" ? "full pass" : "every check"}).{" "}
        <b>Passed:</b> runs that met every check.
      </p>
      <TabStrip tabs={tabs} active="summary" dense onChange={(k) => onOpen(k)} />
    </div>
  );
}

function SheetCell({
  c,
  footer,
  left,
  onTask,
  onRun,
}: {
  c: Cell;
  footer?: boolean;
  left?: number;
  onTask?: (t: string) => void;
  onRun?: (t: string, idx: number) => void;
}) {
  const text = cellText(c);
  const numeric = typeof c.v === "number";
  let body: React.ReactNode = text;
  if (c.kind === "label" && c.taskId && onTask && !footer) {
    body = (
      <button onClick={() => onTask(c.taskId as string)} title={text} className="cell-task">
        {text}
      </button>
    );
  } else if (c.kind === "label") {
    body = (
      <span title={text} className={cn("cell-label", footer && "cell-label-total")}>
        {text}
      </span>
    );
  } else if (c.kind === "link" && c.taskId && c.runIdx && onRun) {
    body = (
      <button onClick={() => onRun(c.taskId as string, c.runIdx as number)} className="cell-link">
        {text} <ArrowUpRight size={11} />
      </button>
    );
  } else if (c.kind === "longtext") {
    body = (
      <span className="clamp-2" title={text}>
        {text}
      </span>
    );
  } else if (c.kind === "score" && typeof c.v === "number") {
    body = <span className={c.v >= 1 ? "tone-pass" : c.v > 0 ? "tone-partial" : "tone-fail"}>{text}</span>;
  }
  return (
    <td
      className={cn(
        numeric && "num",
        footer && "total",
        numeric && c.v === 0 && !footer && "faint",
        c.kind === "longtext" && "long",
        left !== undefined && "frozen",
      )}
      style={left === undefined ? undefined : { left }}
      title={c.hint}
    >
      {body}
    </td>
  );
}

const colWidth = (kind: string, width: number) =>
  kind === "longtext" ? 360 : kind === "metric" ? 112 : kind === "label" ? Math.max(220, width * 7) : kind === "link" ? 96 : Math.max(64, Math.min(260, width * 7.2));

function SheetTable({ tab, onTask, onRun }: { tab: SheetTab; onTask: (t: string) => void; onRun: (t: string, idx: number) => void }) {
  const widths = tab.columns.map((c) => colWidth(c.kind, c.width));
  const left = (i: number) => (i < tab.frozenColumns ? 40 + widths.slice(0, i).reduce((a, b) => a + b, 0) : undefined);
  let row = 0;
  return (
    <table className="sheet-grid" style={{ width: 40 + widths.reduce((a, b) => a + b, 0) }}>
      <colgroup>
        <col style={{ width: 40 }} />
        {widths.map((w, i) => (
          <col key={i} style={{ width: w }} />
        ))}
      </colgroup>
      <thead>
        <tr className="letters">
          <th className="corner" />
          {tab.columns.map((_, i) => (
            <th key={i} className={cn(i < tab.frozenColumns && "frozen")} style={{ left: left(i) }}>
              {column(i)}
            </th>
          ))}
        </tr>
        {tab.header.map((cells, r) => (
          <tr key={r}>
            <th className="row-num">{++row}</th>
            {cells.map((h, i) =>
              h ? (
                <th
                  key={i}
                  colSpan={h.span}
                  rowSpan={h.rowSpan}
                  className={cn("head", (h.span ?? 1) > 1 && "group", i < tab.frozenColumns && "frozen")}
                  style={{ left: left(i) }}
                >
                  {h.label}
                </th>
              ) : null,
            )}
          </tr>
        ))}
      </thead>
      <tbody>
        {tab.rows.map((cells, r) => (
          <tr key={r}>
            <td className="row-num">{++row}</td>
            {cells.map((c, i) => (
              <SheetCell key={i} c={c} left={left(i)} onTask={onTask} onRun={onRun} />
            ))}
          </tr>
        ))}
        {tab.footer.map((cells, r) => (
          <tr key={`f${r}`}>
            <td className="row-num">{++row}</td>
            {cells.map((c, i) => (
              <SheetCell key={i} c={c} footer left={left(i)} />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function save(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// The whole sheet: three tabs, downloads, and a live copy in Google Sheets.
export function ScoreSheet({
  open,
  initialTab,
  onClose,
  payload,
  sharingHref,
}: {
  open: boolean;
  initialTab: TabKey;
  onClose: () => void;
  payload: SheetPayload;
  sharingHref?: string;
}) {
  const tabs = useSheet(payload);
  const routes = useRoutes();
  const [active, setActive] = React.useState<TabKey>(initialTab);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [building, setBuilding] = React.useState(false);
  const toast = useToast();
  const router = useRouter();
  React.useEffect(() => {
    if (open) setActive(initialTab);
  }, [open, initialTab]);

  const tab = tabs.find((t) => t.key === active) ?? tabs[0];
  const base = safeFileName(`${payload.title} - Calibration scores`);
  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content className="sheet-dialog" aria-describedby={undefined}>
          <div className="sheet-head">
            <FileSpreadsheet size={18} className="sheet-icon" />
            <div className="min-w-0">
              <DialogPrimitive.Title className="sheet-title">Calibration scores</DialogPrimitive.Title>
              <div className="sheet-sub">
                {payload.title} · {tab.meta.map(([k, v]) => `${k}: ${v}`).join(" · ")}
              </div>
            </div>
            <div className="sheet-actions">
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger className="pill">
                  <Download size={13} /> Download <ChevronDown size={12} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem
                    disabled={building}
                    onSelect={async (e) => {
                      e.preventDefault();
                      setBuilding(true);
                      try {
                        const { buildWorkbook } = await import("@/lib/workbook");
                        save(await buildWorkbook(tabs, `${payload.title} - Calibration scores`), `${base}.xlsx`);
                        setMenuOpen(false);
                      } catch (err) {
                        toast(`Couldn't build the workbook: ${(err as Error).message}`, "error");
                      } finally {
                        setBuilding(false);
                      }
                    }}
                  >
                    <span className="menu-two-line">
                      <span>{building ? "Building workbook…" : "Excel workbook (.xlsx)"}</span>
                      <small>All three tabs, formatted</small>
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => save(new Blob([toCsv(tab)], { type: "text/csv;charset=utf-8" }), `${base} - ${tab.name}.csv`)}>
                    <span className="menu-two-line">
                      <span>CSV ({tab.name} tab)</span>
                      <small>Plain values, opens anywhere</small>
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {payload.googleSheetUrl ? (
                <a href={payload.googleSheetUrl} target="_blank" rel="noopener noreferrer" className="pill pill-solid">
                  Open in Google Sheets <ArrowUpRight size={13} />
                </a>
              ) : (
                <Popover>
                  <PopoverTrigger className="pill pill-solid">
                    Open in Google Sheets <ArrowUpRight size={13} />
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[340px]">
                    <LiveImport tab={tab} sharingHref={sharingHref} />
                  </PopoverContent>
                </Popover>
              )}
              <DialogPrimitive.Close className="icon-round" aria-label="Close">
                <X size={16} />
              </DialogPrimitive.Close>
            </div>
          </div>
          <div className="sheet-legend">
            <span>
              <b>Criteria achievement:</b>{" "}
              {payload.criteria === "score"
                ? "the grader's task score for a run, averaged over runs (1.000 = full pass)."
                : "checks met ÷ all checks for a run, averaged over runs (1.000 = every check)."}
            </span>
            <span>
              <b>Task completion rate:</b> share of runs that met every check (0.333 = 1 of 3).
            </span>
            <span className="faint">Hover a number to read it in words.</span>
          </div>
          <div className="sheet-scroll">
            <SheetTable tab={tab} onTask={(t) => go(routes.task(t))} onRun={(t, idx) => go(routes.player(t, idx))} />
          </div>
          <TabStrip tabs={tabs} active={active} onChange={setActive} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
