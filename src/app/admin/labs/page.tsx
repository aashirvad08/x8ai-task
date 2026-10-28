import type { Metadata } from "next";
import Link from "next/link";
import { setLabStatus } from "@/app/admin/actions";
import { CreateLabForm, InviteForm, Submit } from "@/components/admin/forms";
import { InvitesTable } from "@/components/admin/tables";
import { labs, openInvites } from "@/lib/server/admin";
import { requireAdmin } from "@/lib/server/auth";
import { fmtAgo, fmtBytes, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Labs · Admin" };

export default async function AdminLabs() {
  await requireAdmin();
  const [rows, invites] = await Promise.all([labs(), openInvites()]);
  return (
    <>
      <section className="admin-section">
        <h2 className="eyebrow">Labs · {rows.length}</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Lab</th>
              <th>Status</th>
              <th className="num">People</th>
              <th className="num">Tasks</th>
              <th className="num">Runs</th>
              <th className="num">Storage</th>
              <th>Last activity</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td>
                  <Link href={`/admin/labs/${l.id}`} className="admin-link">
                    {l.name}
                  </Link>
                  <span className="mono faint"> /{l.slug}</span>
                </td>
                <td>
                  <span className={cn("status", l.status === "active" ? "tone-pass" : "tone-fail")}>{l.status === "active" ? "Active" : "Paused"}</span>
                </td>
                <td className="num">
                  {l.people}
                  {l.owners === 0 && l.people > 0 && <span className="tone-partial" title="No owner: only you can invite people"> · no owner</span>}
                </td>
                <td className="num">
                  {l.tasks}
                  {l.drafts > 0 && <span className="faint"> ({l.drafts} draft{l.drafts === 1 ? "" : "s"})</span>}
                </td>
                <td className="num">{fmtInt(l.runs)}</td>
                <td className="num">{fmtBytes(l.frameBytes + l.stepBytes)}</td>
                <td>{fmtAgo(l.lastActivity)}</td>
                <td className="actions">
                  <div className="row-actions">
                    <Link href={`/labs/${l.slug}`} className="button button-ghost button-sm">
                      Open
                    </Link>
                    <form action={setLabStatus}>
                      <input type="hidden" name="lab" value={l.id} />
                      <input type="hidden" name="status" value={l.status === "active" ? "suspended" : "active"} />
                      <Submit variant="ghost" pending="…">
                        {l.status === "active" ? "Pause access" : "Restore access"}
                      </Submit>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="muted admin-empty">No labs yet. Create one below.</p>}
      </section>
      <div className="admin-grid">
        <section className="admin-section admin-card">
          <h2 className="eyebrow">Create a lab</h2>
          <CreateLabForm />
        </section>
        <section className="admin-section admin-card">
          <h2 className="eyebrow">Invite someone</h2>
          <p className="admin-note">The link creates an account in the lab. Send it yourself; it works once and expires after 7 days. Owners can invite people to their own lab too.</p>
          <InviteForm labs={rows.filter((l) => l.status === "active").map((l) => ({ id: l.id, name: l.name }))} />
        </section>
      </div>
      <section className="admin-section">
        <h2 className="eyebrow">Open invites · {invites.length}</h2>
        <InvitesTable rows={invites} showLab canRevoke />
      </section>
    </>
  );
}
