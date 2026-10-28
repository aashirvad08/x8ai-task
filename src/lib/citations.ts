// Write-ups cite steps as [[182]], [[182-212]] or, across runs, [[r5:401]].

export type StepRef = { rollout: number; step: number; end?: number };

const CITE = /\[\[(?:r(\d+):)?(\d+)(?:\s*[-–]\s*(\d+))?\]\]/gi;

export function parseCitations(text: string, defaultRollout?: number): StepRef[] {
  const out: StepRef[] = [];
  for (const m of text.matchAll(CITE)) {
    const rollout = m[1] ? Number(m[1]) : defaultRollout;
    if (rollout) out.push({ rollout, step: Number(m[2]), end: m[3] ? Number(m[3]) : undefined });
  }
  return out;
}

// Rewrites citations as markdown links with a `step:` URL, so the renderer can turn them into buttons.
export function linkCitations(text: string, defaultRollout?: number) {
  return text.replace(CITE, (whole, r: string | undefined, a: string, b: string | undefined) => {
    const rollout = r ? Number(r) : defaultRollout;
    if (!rollout) return whole;
    const label = `${r ? `R${rollout}:` : "step "}${b ? `${a}-${b}` : a}`;
    return `[${label}](step:${rollout}:${a}${b ? `:${b}` : ""})`;
  });
}

export function parseStepUrl(href: string): StepRef {
  const [, rollout, step, end] = href.split(":");
  return { rollout: Number(rollout), step: Number(step), end: end ? Number(end) : undefined };
}
