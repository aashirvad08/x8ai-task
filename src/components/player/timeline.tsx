"use client";

import * as React from "react";
import { toneClass } from "@/components/marks";
import { parseAction } from "@/lib/actions";
import { useFrameSrc } from "@/components/view";
import type { KeyMoment, Step, WorldEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

const BINS = 160;

// The whole run on one line: where the agent reasoned (bars), key moments (dots), cited steps (ticks above)
// and world events (ticks below). Click or drag to seek; hover to preview the screen.
export function Timeline({
  steps,
  index,
  lastFrame,
  moments,
  citations,
  events,
  onSeek,
}: {
  steps: Step[];
  index: number;
  lastFrame: number[];
  moments: KeyMoment[];
  citations: Map<number, string[]>;
  events: WorldEvent[];
  onSeek: (i: number) => void;
}) {
  const frameSrc = useFrameSrc();
  const track = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);
  const [hover, setHover] = React.useState<{ i: number; x: number } | null>(null);
  const count = steps.length;

  const pctOf = React.useCallback(
    (n: number) => {
      const i = steps.findIndex((s) => s.n >= n);
      return ((i < 0 ? count - 1 : i) / Math.max(1, count - 1)) * 100;
    },
    [steps, count],
  );
  const at = (clientX: number) => {
    const box = (track.current as HTMLDivElement).getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    return { i: Math.round(f * (count - 1)), x: f * box.width };
  };
  const density = React.useMemo(() => {
    const bins = Array(BINS).fill(0);
    steps.forEach((s, i) => {
      if (s.t) bins[Math.floor((i / Math.max(1, count)) * BINS)]++;
    });
    return bins;
  }, [steps, count]);
  const peak = Math.max(1, ...density);
  const hovered = hover ? steps[hover.i] : null;
  const preview = hover ? steps[lastFrame[hover.i] ?? -1]?.f : null;
  const now = (index / Math.max(1, count - 1)) * 100;
  const width = track.current?.clientWidth ?? 0;

  return (
    <div className="timeline">
      {hover && hovered && (
        <div className="timeline-preview" style={{ left: Math.max(96, Math.min(hover.x, width - 96)) }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview && <img src={frameSrc(preview)} alt="" />}
          <div>
            <b>{hovered.n}</b> {parseAction(hovered.a).verb}
            {hovered.c && <small>{hovered.c}</small>}
          </div>
        </div>
      )}
      <div
        ref={track}
        className="timeline-track"
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          onSeek(at(e.clientX).i);
        }}
        onPointerMove={(e) => {
          const p = at(e.clientX);
          setHover(p);
          if (dragging.current) onSeek(p.i);
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerLeave={() => setHover(null)}
      >
        <div className="timeline-density">
          {density.map((v, k) => (
            <span key={k} style={{ height: `${(v / peak) * 100}%` }} />
          ))}
        </div>
        <div className="timeline-line" />
        <div className="timeline-done" style={{ width: `${now}%` }} />
        {[...citations.keys()].map((n) => (
          <span key={`c${n}`} className="timeline-cite" style={{ left: `${pctOf(n)}%` }} />
        ))}
        {events.map((e) => (
          <span
            key={`e${e.step}${e.label}`}
            className={cn("timeline-event", e.silent && "silent")}
            style={{ left: `${pctOf(e.step)}%` }}
            title={`Step ${e.step}: ${e.label} · ${e.time}${e.silent ? " · silent" : ""}`}
          />
        ))}
        {moments.map((m) => (
          <span key={`m${m.step}${m.label}`} title={`Step ${m.step}: ${m.label}`} className={cn("timeline-moment", toneClass(m.tone))} style={{ left: `${pctOf(m.step)}%` }} />
        ))}
        <span className="timeline-head" style={{ left: `${now}%` }} />
      </div>
      <div className="timeline-legend">
        <span>
          <i className="tone-dot tone-dot-good" />
          <i className="tone-dot tone-dot-bad" /> key moments
        </span>
        <span>
          <i className="legend-cite" /> cited
        </span>
        <span>
          <i className="legend-bar" /> reasoning
        </span>
        {events.length > 0 && (
          <span>
            <i className="legend-event" /> world events
          </span>
        )}
      </div>
    </div>
  );
}
