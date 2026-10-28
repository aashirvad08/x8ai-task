"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CritRef } from "@/components/marks";
import { linkCitations, parseStepUrl, type StepRef } from "@/lib/citations";
import type { Criterion } from "@/lib/types";
import { cn } from "@/lib/utils";

// Check ids written as `code` render as the check's label; cited steps render as buttons that open the step.
export const CriteriaContext = React.createContext<Map<string, Criterion>>(new Map());
export const StepRefContext = React.createContext<{ onStep?: (ref: StepRef) => void }>({});

function CodeOrCheck({ children }: { children?: React.ReactNode }) {
  const criteria = React.useContext(CriteriaContext);
  const text = typeof children === "string" ? children : Array.isArray(children) && children.length === 1 && typeof children[0] === "string" ? children[0] : null;
  const c = text ? criteria.get(text.trim()) : undefined;
  return c ? <CritRef c={c} id={c.id} /> : <code>{children}</code>;
}

function StepButton({ refData, children }: { refData: StepRef; children?: React.ReactNode }) {
  const { onStep } = React.useContext(StepRefContext);
  return (
    <button
      type="button"
      className="step-ref"
      title={`Run ${refData.rollout}, step ${refData.step}${refData.end ? `-${refData.end}` : ""}: open the screen`}
      onClick={(e) => {
        e.preventDefault();
        onStep?.(refData);
      }}
    >
      {children}
    </button>
  );
}

const allowUrl = (url: string) => (url.startsWith("step:") || /^(https?:|mailto:|#|\/)/.test(url) ? url : "");

export function RichText({
  text,
  defaultRollout,
  className,
  inline,
}: {
  text: string | null | undefined;
  defaultRollout?: number;
  className?: string;
  inline?: boolean;
}) {
  if (!text) return null;
  return (
    <div className={cn("markdown rich", inline && "rich-inline", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={allowUrl}
        components={{
          code: ({ children }) => <CodeOrCheck>{children}</CodeOrCheck>,
          a: ({ href, children }) =>
            href?.startsWith("step:") ? (
              <StepButton refData={parseStepUrl(href)}>{children}</StepButton>
            ) : (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            ),
          img: () => null,
        }}
      >
        {linkCitations(text, defaultRollout)}
      </ReactMarkdown>
    </div>
  );
}
