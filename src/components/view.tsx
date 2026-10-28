"use client";

import * as React from "react";

// Where the deck, player and overview link to and load from. Inside a lab, pages live under /t/… and data comes from
// endpoints that check the signed-in user. Under a share link, pages live under /v/<token>/… and data comes from
// endpoints that check the link instead.
type View = { share: string | null; lab: string | null };
const ViewContext = React.createContext<View>({ share: null, lab: null });

export function ShareView({ token, children }: { token: string; children: React.ReactNode }) {
  const outer = React.useContext(ViewContext);
  return <ViewContext.Provider value={{ ...outer, share: token }}>{children}</ViewContext.Provider>;
}

// The lab whose screenshots a view shows (used when not under a share link).
export function LabView({ lab, children }: { lab: string; children: React.ReactNode }) {
  const outer = React.useContext(ViewContext);
  return <ViewContext.Provider value={{ ...outer, lab }}>{children}</ViewContext.Provider>;
}

export const useView = () => React.useContext(ViewContext);

export function useRoutes() {
  const { share } = useView();
  return React.useMemo(() => {
    const base = share ? `/v/${share}` : "";
    const task = (id: string, slide?: string) => `${base}/t/${id}${slide ? `/${slide}` : ""}`;
    return {
      shared: Boolean(share),
      home: share ? base : null,
      task,
      player: (id: string, idx: number, step?: number) => `${base}/t/${id}/r/${idx}${step ? `?step=${step}` : ""}`,
      deckRun: (id: string, idx: number) => task(id, `run-${idx}`),
    };
  }, [share]);
}

export function useDataUrls() {
  const { share, lab } = useView();
  return React.useMemo(
    () =>
      share
        ? {
            frame: (hash: string) => `/api/v/${share}/frames/${hash}`,
            steps: (task: string, version: string, idx: number) => `/api/v/${share}/tasks/${task}/steps/${idx}?v=${encodeURIComponent(version)}`,
          }
        : {
            frame: (hash: string) => `/api/labs/${lab}/frames/${hash}`,
            steps: (task: string, version: string, idx: number) => `/api/tasks/${task}/steps/${idx}?v=${encodeURIComponent(version)}`,
          },
    [share, lab],
  );
}

export const useFrameSrc = () => useDataUrls().frame;
