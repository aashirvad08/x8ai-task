import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShareForm } from "@/components/admin/forms";
import { SharesTable } from "@/components/admin/tables";
import { shareLinks } from "@/lib/server/admin";
import { isAdmin, requireUser } from "@/lib/server/auth";
import { bindings } from "@/lib/server/env";
import { getLab } from "@/lib/server/data";

export const metadata: Metadata = { title: "Sharing" };

// Lab owners and the site admin make read-only links for reviewers outside the lab.
export default async function LabSharing({ params }: { params: Promise<{ lab: string }> }) {
  const { lab: slug } = await params;
  const user = await requireUser();
  const lab = await getLab(user, slug);
  if (!lab || !(isAdmin(user) || user.role === "owner")) notFound();
  const { db } = await bindings();
  const [links, published] = await Promise.all([
    shareLinks(lab.id),
    db
      .prepare("SELECT id, code, name FROM tasks WHERE lab_id = ? AND status = 'published' ORDER BY position, created_at")
      .bind(lab.id)
      .all<{ id: string; code: string; name: string }>()
      .then((r) => r.results),
  ]);
  return (
    <div className="admin">
      <div className="admin-head">
        <p className="eyebrow">{lab.name}</p>
        <h1>Sharing</h1>
        <p>
          A share link lets reviewers outside the lab open its published tasks, runs and write-ups without an account, read-only. They can download the
          scores and pull them into Google Sheets. Drafts are never shared. Revoke a link to end access at once.
        </p>
      </div>
      <section className="admin-section admin-card share-card">
        <h2 className="eyebrow">Make a share link</h2>
        {lab.status !== "active" ? (
          <p className="muted">This lab&apos;s access is paused.</p>
        ) : published.length ? (
          <ShareForm lab={lab.id} tasks={published} defaultTitle={`${lab.name} task review`} />
        ) : (
          <p className="muted">Publish a task first; share links show published tasks only.</p>
        )}
      </section>
      <section className="admin-section">
        <h2 className="eyebrow">Share links · {links.length}</h2>
        <SharesTable rows={links} />
      </section>
    </div>
  );
}
