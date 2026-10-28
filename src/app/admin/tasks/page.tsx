import type { Metadata } from "next";
import Link from "next/link";
import { TasksTable } from "@/components/admin/tables";
import { labs, tasks } from "@/lib/server/admin";
import { requireAdmin } from "@/lib/server/auth";
import { fmtBytes, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tasks · Admin" };

export default async function AdminTasks({ searchParams }: { searchParams: Promise<{ lab?: string; status?: string }> }) {
  await requireAdmin();
  const { lab, status } = await searchParams;
  const [rows, allLabs] = await Promise.all([tasks({ lab, status }), labs()]);
  const link = (next: { lab?: string; status?: string }) => {
    const p = new URLSearchParams();
    const l = "lab" in next ? next.lab : lab;
    const s = "status" in next ? next.status : status;
    if (l) p.set("lab", l);
    if (s) p.set("status", s);
    return `/admin/tasks${p.size ? `?${p}` : ""}`;
  };
  return (
    <section className="admin-section">
      <div className="admin-toolbar">
        <h2 className="eyebrow">
          Tasks · {rows.length} · {fmtInt(rows.reduce((n, t) => n + t.run_count, 0))} runs · {fmtBytes(rows.reduce((n, t) => n + t.bytes, 0))}
        </h2>
        <div className="filter-links">
          <Link href={link({ status: undefined })} className={cn(!status && "active")}>
            Any status
          </Link>
          <Link href={link({ status: "published" })} className={cn(status === "published" && "active")}>
            Published
          </Link>
          <Link href={link({ status: "draft" })} className={cn(status === "draft" && "active")}>
            Drafts
          </Link>
        </div>
        <div className="filter-links">
          <Link href={link({ lab: undefined })} className={cn(!lab && "active")}>
            Every lab
          </Link>
          {allLabs.map((l) => (
            <Link key={l.id} href={link({ lab: l.id })} className={cn(lab === l.id && "active")}>
              {l.name}
            </Link>
          ))}
        </div>
      </div>
      <TasksTable rows={rows} showLab back={link({})} />
    </section>
  );
}
