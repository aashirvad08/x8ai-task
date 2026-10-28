"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";
import { logout } from "@/app/actions";
import type { ShellUser } from "@/components/sidebar";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { ThemeMenu } from "@/components/theme-menu";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { taskHref } from "@/lib/routes";
import type { NavLab } from "@/lib/types";

const ROLE = { admin: "Site admin", owner: "Lab owner", member: "Lab member" } as const;

function UserMenu({ user }: { user: ShellUser }) {
  const [pending, start] = React.useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account">
          <UserRound size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Signed in</DropdownMenuLabel>
        <div className="menu-account">
          <strong>{user.name || user.email}</strong>
          {user.name && <span>{user.email}</span>}
          <span>
            {ROLE[user.role]}
            {user.lab ? ` · ${user.lab.name}` : ""}
          </span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <Settings size={14} /> Your account
          </Link>
        </DropdownMenuItem>
        {user.role === "admin" && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <ShieldCheck size={14} /> Admin
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={pending} onSelect={() => start(() => logout())}>
          <LogOut size={14} /> {pending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar({ nav, user }: { nav: NavLab[]; user: ShellUser }) {
  const path = usePathname();
  const [, section, id, sub, idx] = path.split("/");
  const lab = section === "t" ? nav.find((l) => l.tasks.some((t) => t.id === id)) : section === "labs" ? nav.find((l) => l.slug === id) : undefined;
  const task = section === "t" ? lab?.tasks.find((t) => t.id === id) : undefined;
  const run = task && sub === "r" ? task.rollouts.find((r) => r.idx === Number(idx)) : undefined;
  const page = section === "labs" ? ({ people: "People", upload: "Upload tasks", sharing: "Sharing" } as Record<string, string>)[sub] : undefined;
  return (
    <header className="topbar">
      <div className="topbar-left">
        <SidebarToggle />
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          {section === "admin" ? (
            <strong>Admin</strong>
          ) : section === "account" ? (
            <strong>Your account</strong>
          ) : lab ? (
            <>
              {task || page ? <Link href={`/labs/${lab.slug}`}>{lab.name}</Link> : <strong>{lab.name}</strong>}
              {page && (
                <>
                  <ChevronRight size={12} />
                  <strong>{page}</strong>
                </>
              )}
              {task && (
                <>
                  <ChevronRight size={12} />
                  {run ? <Link href={taskHref(task.id)}>{task.code}</Link> : <span>{task.code}</span>}
                  <ChevronRight size={12} />
                  <strong>{run ? `Run ${run.idx} · ${run.model}` : task.name}</strong>
                </>
              )}
            </>
          ) : (
            <strong>Run Deck</strong>
          )}
        </nav>
      </div>
      <div className="topbar-right">
        <ThemeMenu />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
