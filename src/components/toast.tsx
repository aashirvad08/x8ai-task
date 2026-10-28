"use client";

import * as React from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "ok" | "error";
type Toast = { id: number; message: string; tone: Tone };

const ToastContext = React.createContext<(message: string, tone?: Tone) => void>(() => {});

// Short confirmations ("Link copied") at the bottom of the screen; errors stay a little longer.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const push = React.useCallback((message: string, tone: Tone = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, message, tone }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), tone === "error" ? 6000 : 3200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role="status" className={cn("toast", t.tone === "error" && "toast-error")}>
            {t.tone === "ok" ? <CircleCheck size={15} /> : <CircleAlert size={15} />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => React.useContext(ToastContext);
