import type { Metadata } from "next";
import Link from "next/link";
import { ActivityList } from "@/components/admin/tables";
import { activity, attention, siteTotals } from "@/lib/server/admin";
import { requireAdmin } from "@/lib/server/auth";
import { fmtBytes, fmtInt } from "@/lib/format";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminOverview() {
  await requireAdmin();
  const [t, a, recent] = await Promise.all([siteTotals(), attention(), activity({ limit: 12 })]);
  const tiles: [string, string, string?][] = [
    ["Labs", fmtInt(t.labs), t.paused ? `${t.paused} paused` : undefined],
    ["People", fmtInt(t.people), t.disabled ? `${t.disabled} turned off` : undefined],
    ["Tasks", fmtInt(t.published + t.drafts), t.drafts ? `${t.drafts} draft${t.drafts === 1 ? "" : "s"}` : undefined],
    ["Runs", fmtInt(t.runs)],
    ["Steps", fmtInt(t.steps)],
    ["Storage", fmtBytes(t.frameBytes + t.stepBytes), `${fmtInt(t.frames)} screenshots`],
  ];
  const notes = [
    a.staleUploads > 0 && { text: `${a.staleUploads} upload${a.staleUploads === 1 ? " was" : "s were"} started over a day ago and never finished.`, href: "/admin/maintenance" },
    a.orphanFrames > 0 && {
      text: `${fmtInt(a.orphanFrames)} screenshot${a.orphanFrames === 1 ? "" : "s"} (${fmtBytes(a.orphanBytes)}) belong${a.orphanFrames === 1 ? "s" : ""} to no task.`,
      href: "/admin/maintenance",
    },
    a.pausedLabs > 0 && { text: `${a.pausedLabs} lab${a.pausedLabs === 1 ? " has" : "s have"} paused access.`, href: "/admin/labs" },
    a.expiringInvites > 0 && { text: `${a.expiringInvites} invite${a.expiringInvites === 1 ? "" : "s"} expire within a day.`, href: "/admin/labs" },
  ].filter(Boolean) as { text: string; href: string }[];
  return (
    <>
      <div className="stat-tiles">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="stat-tile">
            <span>{label}</span>
            <strong>{value}</strong>
            {sub && <small>{sub}</small>}
          </div>
        ))}
      </div>
      <div className="admin-grid">
        <section className="admin-section admin-card">
          <h2 className="eyebrow">Needs attention</h2>
          {notes.length ? (
            <ul className="attention">
              {notes.map((n) => (
                <li key={n.text}>
                  {n.text} <Link href={n.href}>Look</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing needs attention.</p>
          )}
        </section>
        <section className="admin-section admin-card">
          <h2 className="eyebrow">Recent activity</h2>
          <ActivityList rows={recent} />
          <Link href="/admin/activity" className="admin-more">
            All activity
          </Link>
        </section>
      </div>
    </>
  );
}
