"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search } from "lucide-react";
import { ActionLine } from "@/components/action-line";
import { toneClass } from "@/components/marks";
import { ACTION_GROUPS, parseAction } from "@/lib/actions";
import { fmtInt } from "@/lib/format";
import type { KeyMoment, Step, WorldEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

// Every step of the run, searchable and filterable; only the rows in view are rendered.
export function StepList({
  steps,
  index,
  moments,
  citations,
  events,
  onPick,
}: {
  steps: Step[];
  index: number;
  moments: Map<number, KeyMoment>;
  citations: Map<number, string[]>;
  events: Map<number, WorldEvent[]>;
  onPick: (i: number) => void;
}) {
  const [filter, setFilter] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const parsed = React.useMemo(() => steps.map((s) => parseAction(s.a)), [steps]);
  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: number[] = [];
    steps.forEach((s, i) => {
      if (filter === "thoughts" && !s.t) return;
      if (filter === "moments" && !moments.has(s.n) && !citations.has(s.n)) return;
      if (filter === "events" && !events.has(s.n)) return;
      if (!["all", "thoughts", "moments", "events"].includes(filter) && parsed[i].group !== filter) return;
      if (q && !s.a.toLowerCase().includes(q) && !(s.t ?? "").toLowerCase().includes(q) && !(s.o ?? "").toLowerCase().includes(q)) return;
      out.push(i);
    });
    return out;
  }, [steps, filter, query, moments, citations, events, parsed]);

  const scroller = React.useRef<HTMLDivElement>(null);
  const list = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, estimateSize: () => 50, overscan: 12 });

  React.useEffect(() => {
    const k = rows.indexOf(index);
    if (k >= 0) list.scrollToIndex(k, { align: "auto" });
    // Follow the current step only when it moves, not when the filter changes.
  }, [index]);

  const filters = [
    { id: "all", label: "All" },
    { id: "moments", label: "Key & cited" },
    { id: "thoughts", label: "Reasoning" },
    ...(events.size ? [{ id: "events", label: "World events" }] : []),
    ...ACTION_GROUPS.filter((g) => parsed.some((p) => p.group === g.id)).map((g) => ({ id: g.id as string, label: g.label })),
  ];

  return (
    <div className="step-list">
      <div className="step-list-head">
        <label className="step-search">
          <Search size={13} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search actions, reasoning and output" />
        </label>
        <div className="step-filters">
          {filters.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="step-list-count">{fmtInt(rows.length)} steps</div>
      </div>
      <div ref={scroller} className="step-list-scroll">
        <div style={{ height: list.getTotalSize(), position: "relative" }}>
          {list.getVirtualItems().map((v) => {
            const i = rows[v.index];
            const s = steps[i];
            const m = moments.get(s.n);
            const evs = events.get(s.n);
            return (
              <button
                key={v.key}
                data-index={v.index}
                ref={list.measureElement}
                onClick={() => onPick(i)}
                className={cn("step-item", i === index && "current")}
                style={{ transform: `translateY(${v.start}px)` }}
              >
                <span className="step-item-n">{s.n}</span>
                <span className="min-w-0 flex-1">
                  <ActionLine action={parsed[i]} compact />
                  {m && (
                    <span className="step-item-moment">
                      <i className={cn("tone-dot", toneClass(m.tone))} />
                      {m.label}
                    </span>
                  )}
                  {evs?.map((e) => (
                    <span key={e.label} className="step-item-moment">
                      <i className={cn("tone-dot", e.silent ? "event-dot-silent" : "event-dot")} />
                      {e.label}
                    </span>
                  ))}
                  {s.t && <span className="step-item-thought">{s.t}</span>}
                </span>
                {citations.has(s.n) && <span className="step-item-cited" title="Cited in a write-up" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
