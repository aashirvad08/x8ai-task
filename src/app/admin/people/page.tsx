import type { Metadata } from "next";
import Link from "next/link";
import { TableSearch } from "@/components/admin/forms";
import { PeopleTable } from "@/components/admin/tables";
import { labs, people } from "@/lib/server/admin";
import { requireAdmin } from "@/lib/server/auth";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "People · Admin" };

export default async function AdminPeople({ searchParams }: { searchParams: Promise<{ lab?: string }> }) {
  const admin = await requireAdmin();
  const { lab } = await searchParams;
  const [rows, allLabs] = await Promise.all([people(lab || undefined), labs()]);
  return (
    <section className="admin-section">
      <div className="admin-toolbar">
        <h2 className="eyebrow">People · {rows.length}</h2>
        <div className="filter-links">
          <Link href="/admin/people" className={cn(!lab && "active")}>
            Everyone
          </Link>
          {allLabs.map((l) => (
            <Link key={l.id} href={`/admin/people?lab=${l.id}`} className={cn(lab === l.id && "active")}>
              {l.name}
            </Link>
          ))}
        </div>
        <TableSearch placeholder="Search name, email or lab" target=".people-list" />
      </div>
      <p className="admin-note">
        Owners can invite people to their lab and turn its members off. A reset link lets someone set a new password once, within a day; send it to them yourself.
      </p>
      <div className="people-list">
        <PeopleTable rows={rows} mode="admin" me={admin.id} showLab />
      </div>
    </section>
  );
}
