"use client";

import * as React from "react";
import { parseAction } from "@/lib/actions";
import type { Step } from "@/lib/types";
import { cn } from "@/lib/utils";

const BACK = 40;
const EARLIER_CHARS = 2_000;

// The prompt line for a step: `$ command` for shell commands, `→ call(args)` for anything else.
export function commandLine(step: Step) {
  const a = parseAction(step.a);
  return a.group === "terminal" ? { shell: true, text: a.detail } : { shell: false, text: step.a };
}

// For command-line and tool tasks: the run so far as a terminal, ending at the current step. Earlier outputs are
// shortened; click any of them to go to that step.
export function TerminalView({ steps, index, onSeek }: { steps: Step[]; index: number; onSeek: (i: number) => void }) {
  const box = React.useRef<HTMLDivElement>(null);
  const from = Math.max(0, index - BACK);
  React.useEffect(() => {
    box.current?.querySelector(".term-entry.current")?.scrollIntoView({ block: "end" });
  }, [index]);
  return (
    <div className="terminal" ref={box} role="log" aria-label="Commands and their output">
      {from > 0 && <div className="term-more">{from} earlier steps</div>}
      {steps.slice(from, index + 1).map((s, k) => {
        const i = from + k;
        const current = i === index;
        const line = commandLine(s);
        const out = s.o ?? "";
        const shown = current || out.length <= EARLIER_CHARS ? out : `${out.slice(0, EARLIER_CHARS)}\n…`;
        return (
          <div key={s.n} className={cn("term-entry", current && "current")} onClick={() => !current && onSeek(i)}>
            <div className="term-cmd">
              <span className="term-n">{s.n}</span>
              <span className="term-prompt">{line.shell ? "$" : "→"}</span>
              <span className="term-text">{line.text}</span>
            </div>
            {shown && <pre className="term-out">{shown}</pre>}
          </div>
        );
      })}
    </div>
  );
}
