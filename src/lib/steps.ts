import type { Step } from "./types";

// Each run's steps load once per page session; a failed load is forgotten so the next attempt retries.
const cache = new Map<string, Promise<Step[]>>();

export function loadSteps(url: string): Promise<Step[]> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url).then((res) => {
      if (!res.ok) throw new Error(res.status === 404 ? "This run has no recorded steps." : `Request failed (${res.status})`);
      return res.json() as Promise<Step[]>;
    });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}
