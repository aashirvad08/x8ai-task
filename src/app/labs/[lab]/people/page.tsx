import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InviteForm } from "@/components/admin/forms";
import { InvitesTable, PeopleTable } from "@/components/admin/tables";
import { openInvites, people } from "@/lib/server/admin";
import { isAdmin, requireUser } from "@/lib/server/auth";
import { getLab } from "@/lib/server/data";

export const metadata: Metadata = { title: "People" };

// Everyone in the lab can see who else is in it; owners (and the site admin) invite people and turn members off.
export default async function LabPeople({ params }: { params: Promise<{ lab: string }> }) {
  const { lab: slug } = await params;
  const user = await requireUser();
  const lab = await getLab(user, slug);
  if (!lab) notFound();
  const manages = isAdmin(user) || user.role === "owner";
  const [rows, invites] = await Promise.all([people(lab.id), manages ? openInvites(lab.id) : Promise.resolve([])]);
  return (
    <div className="admin">
      <div className="admin-head">
        <p className="eyebrow">{lab.name}</p>
        <h1>People</h1>
        <p>
          {manages
            ? "Invite people to the lab with a link you send them yourself. Members can view, upload and publish tasks; owners can also invite people, turn members off and delete tasks."
            : "Everyone who can see this lab's tasks. Ask an owner to invite someone."}
        </p>
      </div>
      <section className="admin-section">
        <h2 className="eyebrow">In {lab.name} · {rows.length}</h2>
        <PeopleTable rows={rows} mode={manages ? "owner" : "viewer"} me={user.id} />
      </section>
      {manages && (
        <>
          <section className="admin-section admin-card invite-card">
            <h2 className="eyebrow">Invite someone</h2>
            {lab.status === "active" ? <InviteForm fixedLab={lab.id} /> : <p className="muted">This lab's access is paused.</p>}
          </section>
          <section className="admin-section">
            <h2 className="eyebrow">Open invites · {invites.length}</h2>
            <InvitesTable rows={invites} canRevoke />
          </section>
        </>
      )}
    </div>
  );
}
