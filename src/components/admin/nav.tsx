"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/labs", label: "Labs" },
  { href: "/admin/people", label: "People" },
  { href: "/admin/tasks", label: "Tasks" },
  { href: "/admin/activity", label: "Activity" },
  { href: "/admin/maintenance", label: "Storage" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="admin-nav" aria-label="Admin sections">
      {SECTIONS.map((s) => {
        const active = s.href === "/admin" ? path === "/admin" : path.startsWith(s.href);
        return (
          <Link key={s.href} href={s.href} aria-current={active ? "page" : undefined} className={cn(active && "active")}>
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
