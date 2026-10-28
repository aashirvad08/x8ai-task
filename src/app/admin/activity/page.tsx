import type { Metadata } from "next";
import Link from "next/link";
import { ActivityList } from "@/components/admin/tables";
import { ACTIVITY_KINDS } from "@/lib/activity-text";
import { activity, labs } from "@/lib/server/admin";
import { requireAdmin } from "@/lib/server/auth";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Activity · Admin" };

const PAGE = 50;

export default async function AdminActivity({ searchParams }: { searchParams: Promise<{ lab?: string; kind?: string; before?: string }> }) {
  await requireAdmin();
  const { lab, kind, before } = await searchParams;
  const [rows, allLabs] = await Promise.all([activity({ lab, kind, before: Number(before) || undefined, limit: PAGE + 1 }), labs()]);
  const shown = rows.slice(0, PAGE);
  const link = (next: { lab?: string; kind?: string; before?: number }) => {
    const p = new URLSearchParams();
    const l = "lab" in next ? next.lab : lab;
    const k = "kind" in next ? next.kind : kind;
    if (l) p.set("lab", l);
    if (k) p.set("kind", k);
    if (next.before) p.set("before", String(next.before));
    return `/admin/activity${p.size ? `?${p}` : ""}`;
  };
  return (
    <section className="admin-section">
      <div className="admin-toolbar">
        <h2 className="eyebrow">Activity</h2>
        <div className="filter-links">
          <Link href={link({ kind: undefined })} className={cn(!kind && "active")}>
            Everything
          </Link>
          {ACTIVITY_KINDS.map((k) => (
            <Link key={k.id} href={link({ kind: k.id })} className={cn(kind === k.id && "active")}>
              {k.label}
            </Link>
          ))}
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
      <ActivityList rows={shown} />
      <div className="pager-links">
        {before && <Link href={link({})}>Newest</Link>}
        {rows.length > PAGE && <Link href={link({ before: shown[shown.length - 1].id })}>Older</Link>}
      </div>
    </section>
  );
}
