"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Share2, ShieldCheck, Users } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { taskHref } from "@/lib/routes";
import type { NavLab } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ShellUser = { name: string; email: string; role: "admin" | "owner" | "member"; lab: { id: string; slug: string; name: string } | null };

// The user's lab and its tasks; the admin sees every lab.
export function Sidebar({ nav, user }: { nav: NavLab[]; user: ShellUser }) {
  const path = usePathname();
  const admin = user.role === "admin";
  const runs = nav.reduce((n, l) => n + l.tasks.reduce((m, t) => m + t.rollouts.length, 0), 0);
  return (
    <aside className="sidebar" aria-label="Tasks">
      <div className="sidebar-inner">
        <Link href="/" className="brand">
          <BrandMark className="brand-mark" />
          Run Deck
        </Link>
        {admin && (
          <Link href="/admin" className={cn("nav-home", path.startsWith("/admin") && "active")}>
            <ShieldCheck size={15} /> Admin
          </Link>
        )}
        {nav.map((lab) => (
          <div key={lab.id} className="nav-lab">
            <Link href={`/labs/${lab.slug}`} className={cn("nav-home", path === `/labs/${lab.slug}` && "active")}>
              <LayoutGrid size={15} /> {admin ? lab.name : "All tasks"}
            </Link>
            {!admin && (
              <Link href={`/labs/${lab.slug}/people`} className={cn("nav-home nav-sub", path === `/labs/${lab.slug}/people` && "active")}>
                <Users size={15} /> People
              </Link>
            )}
            {user.role === "owner" && (
              <Link href={`/labs/${lab.slug}/sharing`} className={cn("nav-home nav-sub", path === `/labs/${lab.slug}/sharing` && "active")}>
                <Share2 size={15} /> Sharing
              </Link>
            )}
            <p className="nav-label">{admin ? `${lab.name} · tasks` : "Tasks"}</p>
            <nav className="task-nav">
              {lab.tasks.length === 0 && <p className="nav-empty">No tasks yet.</p>}
              {lab.tasks.map((t) => (
                <Link key={t.id} href={taskHref(t.id)} className={cn((path === taskHref(t.id) || path.startsWith(`${taskHref(t.id)}/`)) && "active")}>
                  <span className="task-nav-top">
                    {t.code}
                    {t.status === "draft" && <span className="draft-tag">Draft</span>}
                  </span>
                  <strong>{t.name}</strong>
                </Link>
              ))}
            </nav>
          </div>
        ))}
        <div className="sidebar-bottom">
          <span>
            <span className="local-dot" />
            {runs} runs
          </span>
          <span>{admin ? `${nav.length} ${nav.length === 1 ? "lab" : "labs"}` : user.lab?.name}</span>
        </div>
      </div>
    </aside>
  );
}
