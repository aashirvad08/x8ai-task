import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { setLabStatus } from "@/app/admin/actions";
import { DeleteLabForm, InviteForm, LabSettingsForm, Submit } from "@/components/admin/forms";
import { ActivityList, InvitesTable, PeopleTable, SharesTable, TasksTable } from "@/components/admin/tables";
import { activity, lab as getLab, openInvites, people, shareLinks, tasks } from "@/lib/server/admin";
import { requireAdmin } from "@/lib/server/auth";
import { fmtBytes, fmtDate, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  await requireAdmin();
  const { id } = await params;
  return { title: `${(await getLab(id))?.name ?? "Lab"} · Admin` };
}

export default async function AdminLab({ params }: { params: Promise<Params> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const lab = await getLab(id);
  if (!lab) notFound();
  const [members, invites, labTasks, events, shares] = await Promise.all([
    people(id),
    openInvites(id),
    tasks({ lab: id }),
    activity({ lab: id, limit: 20 }),
    shareLinks(id),
  ]);
  const settings = JSON.parse(lab.settings || "{}") as { criteria?: string };
  return (
    <>
      <div className="lab-head">
        <div>
          <h1>{lab.name}</h1>
          <p className="muted">
            <span className="mono">/labs/{lab.slug}</span> · created {fmtDate(lab.created_at)} ·{" "}
            <span className={cn("status", lab.status === "active" ? "tone-pass" : "tone-fail")}>{lab.status === "active" ? "Active" : "Access paused"}</span>
          </p>
        </div>
        <div className="row-actions">
          <Link href={`/labs/${lab.slug}`} className="button button-outline button-sm">
            Open the lab
          </Link>
          <form action={setLabStatus}>
            <input type="hidden" name="lab" value={lab.id} />
            <input type="hidden" name="status" value={lab.status === "active" ? "suspended" : "active"} />
            <Submit variant="outline" pending="…">
              {lab.status === "active" ? "Pause access" : "Restore access"}
            </Submit>
          </form>
        </div>
      </div>

      <div className="stat-tiles">
        <div className="stat-tile">
          <span>People</span>
          <strong>{lab.people}</strong>
          <small>
            {lab.owners} owner{lab.owners === 1 ? "" : "s"}
          </small>
        </div>
        <div className="stat-tile">
          <span>Tasks</span>
          <strong>{lab.tasks}</strong>
          {lab.drafts > 0 && <small>{lab.drafts} drafts</small>}
        </div>
        <div className="stat-tile">
          <span>Runs</span>
          <strong>{fmtInt(lab.runs)}</strong>
          <small>{fmtInt(lab.steps)} steps</small>
        </div>
        <div className="stat-tile">
          <span>Storage</span>
          <strong>{fmtBytes(lab.frameBytes + lab.stepBytes)}</strong>
          <small>{fmtInt(lab.frames)} screenshots</small>
        </div>
      </div>

      <section className="admin-section">
        <h2 className="eyebrow">People · {members.length}</h2>
        <PeopleTable rows={members} mode="admin" me={admin.id} />
      </section>

      <div className="admin-grid">
        <section className="admin-section admin-card">
          <h2 className="eyebrow">Invite someone to {lab.name}</h2>
          {lab.status === "active" ? <InviteForm fixedLab={lab.id} /> : <p className="muted">Restore the lab's access to invite people.</p>}
        </section>
        <section className="admin-section admin-card">
          <h2 className="eyebrow">Settings</h2>
          <LabSettingsForm lab={{ id: lab.id, name: lab.name, slug: lab.slug, description: lab.description, criteria: settings.criteria === "score" ? "score" : "checks" }} />
        </section>
      </div>

      <section className="admin-section">
        <h2 className="eyebrow">Open invites · {invites.length}</h2>
        <InvitesTable rows={invites} canRevoke />
      </section>

      <section className="admin-section">
        <h2 className="eyebrow">Tasks · {labTasks.length}</h2>
        <TasksTable rows={labTasks} back={`/admin/labs/${lab.id}`} />
      </section>

      <section className="admin-section">
        <div className="admin-toolbar">
          <h2 className="eyebrow">Share links · {shares.length}</h2>
          <Link href={`/labs/${lab.slug}/sharing`} className="admin-more">
            Make a share link
          </Link>
        </div>
        <SharesTable rows={shares} />
      </section>

      <section className="admin-section">
        <h2 className="eyebrow">Recent activity</h2>
        <ActivityList rows={events} showLab={false} />
        <Link href={`/admin/activity?lab=${lab.id}`} className="admin-more">
          All of {lab.name}&apos;s activity
        </Link>
      </section>

      <section className="admin-section admin-card danger-zone">
        <h2 className="eyebrow">Delete this lab</h2>
        <p className="admin-note">
          Removes {lab.name} for good: its {lab.people} people and their accounts, open invites, {lab.tasks} tasks with their runs, and{" "}
          {fmtBytes(lab.frameBytes + lab.stepBytes)} of stored files. To keep the people but stop access, pause it instead.
        </p>
        <DeleteLabForm lab={{ id: lab.id, name: lab.name }} />
      </section>
    </>
  );
}
