"use client";

import { usePathname } from "next/navigation";
import { Sidebar, type ShellUser } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import type { NavLab } from "@/lib/types";

// Signed-in pages get the sidebar and top bar; sign-in, setup and invite pages stand on their own. Share links
// (/v/…) have a frame of their own, whoever opens them.
export function ShellGate({ user, nav, children }: { user: ShellUser | null; nav: NavLab[]; children: React.ReactNode }) {
  const path = usePathname();
  if (path.startsWith("/v/")) return <>{children}</>;
  if (!user) return <main className="auth-page">{children}</main>;
  return (
    <div className="app-shell">
      <Sidebar nav={nav} user={user} />
      <div className="workspace-main">
        <Topbar nav={nav} user={user} />
        <main className="workspace-content">{children}</main>
      </div>
    </div>
  );
}
