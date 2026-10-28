"use client";

import * as React from "react";
import { ImageOff } from "lucide-react";
import type { Overlay } from "@/lib/actions";
import { useFrameSrc } from "@/components/view";
import { SCREEN } from "@/lib/format";
import { cn } from "@/lib/utils";

// A screenshot with the action drawn where it landed. Marks use the agent's screen coordinates.
export function Screen({
  frame,
  overlay,
  showOverlay = true,
  alt,
  className,
}: {
  frame: string | null | undefined;
  overlay?: Overlay;
  showOverlay?: boolean;
  alt?: string;
  className?: string;
}) {
  const frameSrc = useFrameSrc();
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [frame]);

  if (!frame) {
    return (
      <div className={cn("screen screen-empty", className)}>
        <ImageOff size={22} />
        No screenshot for this step
      </div>
    );
  }
  return (
    <div className={cn("screen", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={frameSrc(frame)}
        alt={alt ?? "Screen after this step"}
        draggable={false}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={cn(!loaded && "loading")}
      />
      {failed && (
        <div className="screen-failed">
          <ImageOff size={16} /> Screenshot unavailable
        </div>
      )}
      {showOverlay && overlay && (
        <svg viewBox={`0 0 ${SCREEN.w} ${SCREEN.h}`} className="screen-overlay" preserveAspectRatio="none" aria-hidden="true">
          <OverlayMark o={overlay} />
        </svg>
      )}
    </div>
  );
}

function OverlayMark({ o }: { o: Overlay }) {
  switch (o.kind) {
    case "point":
      return (
        <g className="mark">
          <circle cx={o.x} cy={o.y} r={22} className="mark-halo">
            <animate attributeName="r" values="14;26;14" dur="1.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.5;1" dur="1.6s" repeatCount="indefinite" />
          </circle>
          <circle cx={o.x} cy={o.y} r={4.5} className="mark-dot" />
        </g>
      );
    case "drag":
      return (
        <g className="mark">
          <defs>
            <marker id="mark-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="mark-fill" />
            </marker>
          </defs>
          <line x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} className="mark-line" strokeDasharray="10 6" markerEnd="url(#mark-arrow)" />
          <circle cx={o.x1} cy={o.y1} r={7} className="mark-dot" />
        </g>
      );
    case "region":
      return (
        <g className="mark">
          <rect
            x={Math.min(o.x1, o.x2)}
            y={Math.min(o.y1, o.y2)}
            width={Math.abs(o.x2 - o.x1)}
            height={Math.abs(o.y2 - o.y1)}
            rx={4}
            className="mark-region"
            strokeDasharray="8 5"
          />
        </g>
      );
    case "scroll": {
      const dx = Math.sign(o.dx) * 60;
      const dy = Math.sign(o.dy) * 60;
      return (
        <g className="mark">
          <defs>
            <marker id="mark-arrow-s" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="mark-fill" />
            </marker>
          </defs>
          <circle cx={o.x} cy={o.y} r={6} className="mark-dot" />
          {(dx || dy) !== 0 && <line x1={o.x} y1={o.y} x2={o.x + dx} y2={o.y + dy} className="mark-line" markerEnd="url(#mark-arrow-s)" />}
        </g>
      );
    }
  }
}
