"use server";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isAdmin, requireAdmin, requireUser, type SessionUser } from "@/lib/server/auth";
import { newId, randomToken, sha256 } from "@/lib/server/crypto";
import { audit, bindings } from "@/lib/server/env";
import { field, slugify, validEmail, type FormState } from "@/lib/server/forms";
import { orphanFrames, staleUploads } from "@/lib/server/admin";
import { frameKey, stepsPrefix } from "@/lib/server/storage";
import { deletePrefix } from "@/lib/server/tasks";

const INVITE_DAYS = 7;
const RESET_HOURS = 24;

// The site admin manages every lab; a lab owner manages invites and members in their own lab.
const managesLab = (u: SessionUser, labId: string) => isAdmin(u) || (u.role === "owner" && u.lab?.id === labId);
const refresh = () => revalidatePath("/", "layout");

async function origin() {
  const h = await headers();
  return h.get("origin") ?? `https://${h.get("host")}`;
}

// Labs (site admin only)

export async function createLab(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const name = field(form, "name").slice(0, 120);
  const description = field(form, "description").slice(0, 2_000);
  if (!name) return { error: "Give the lab a name." };
  const base = slugify(field(form, "slug") || name);
  if (!base) return { error: "Use letters or numbers in the lab's short name." };
  const { db } = await bindings();
  let slug = base;
  for (let n = 2; await db.prepare("SELECT 1 FROM labs WHERE slug = ?").bind(slug).first(); n++) slug = `${base}-${n}`;
  const id = newId("lab");
  await db
    .prepare("INSERT INTO labs (id, slug, name, description, settings, status, created_at) VALUES (?, ?, ?, ?, '{}', 'active', ?)")
    .bind(id, slug, name, description, Date.now())
    .run();
  await audit("lab.created", { userId: admin.id, labId: id, detail: { name, slug } });
  refresh();
  return { ok: `Created ${name}.` };
}

export async function updateLab(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = field(form, "lab");
  const name = field(form, "name").slice(0, 120);
  const slug = slugify(field(form, "slug"));
  const description = field(form, "description").slice(0, 2_000);
  const criteria = field(form, "criteria") === "score" ? "score" : "checks";
  if (!name) return { error: "Give the lab a name." };
  if (!slug) return { error: "Use letters or numbers in the lab's short name." };
  const { db } = await bindings();
  const lab = await db.prepare("SELECT settings FROM labs WHERE id = ?").bind(id).first<{ settings: string }>();
  if (!lab) return { error: "That lab doesn't exist." };
  if (await db.prepare("SELECT 1 FROM labs WHERE slug = ? AND id != ?").bind(slug, id).first()) return { error: `Another lab already uses /labs/${slug}.` };
  const settings = { ...(JSON.parse(lab.settings || "{}") as Record<string, unknown>), criteria };
  await db.prepare("UPDATE labs SET name = ?, slug = ?, description = ?, settings = ? WHERE id = ?").bind(name, slug, description, JSON.stringify(settings), id).run();
  await audit("lab.updated", { userId: admin.id, labId: id, detail: { name, slug, criteria } });
  refresh();
  return { ok: "Saved." };
}

export async function setLabStatus(form: FormData) {
  const admin = await requireAdmin();
  const id = field(form, "lab");
  const status = field(form, "status") === "suspended" ? "suspended" : "active";
  const { db } = await bindings();
  await db.prepare("UPDATE labs SET status = ? WHERE id = ?").bind(status, id).run();
  await audit(status === "suspended" ? "lab.suspended" : "lab.activated", { userId: admin.id, labId: id });
  refresh();
}

// Removes the lab with its people, invites, tasks, steps and screenshots. The name must be typed to confirm.
export async function deleteLab(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = field(form, "lab");
  const { db } = await bindings();
  const lab = await db.prepare("SELECT name, slug FROM labs WHERE id = ?").bind(id).first<{ name: string; slug: string }>();
  if (!lab) return { error: "That lab doesn't exist." };
  if (field(form, "confirm") !== lab.name) return { error: `Type the lab's name, ${lab.name}, to confirm.` };
  const counts = await db
    .prepare("SELECT (SELECT COUNT(*) FROM users WHERE lab_id = ?1) AS people, (SELECT COUNT(*) FROM tasks WHERE lab_id = ?1) AS tasks")
    .bind(id)
    .first<{ people: number; tasks: number }>();
  const files = await deletePrefix(`labs/${id}/`);
  await db.prepare("DELETE FROM labs WHERE id = ?").bind(id).run();
  await audit("lab.deleted", { userId: admin.id, labId: id, detail: { name: lab.name, slug: lab.slug, ...counts, files } });
  refresh();
  redirect("/admin/labs");
}

// Invites (site admin, or the lab's owners)

export async function createInvite(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const labId = field(form, "lab");
  const email = field(form, "email");
  const role = field(form, "role") === "owner" ? "owner" : "member";
  if (!managesLab(user, labId)) return { error: "Only the lab's owners and the site admin can invite people." };
  if (email && !validEmail(email)) return { error: "Enter a valid email address, or leave it empty." };
  const { db } = await bindings();
  if (!(await db.prepare("SELECT 1 FROM labs WHERE id = ? AND status = 'active'").bind(labId).first()))
    return { error: "Invites can only be made for an active lab." };
  if (email && (await db.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first())) return { error: "Someone already has an account with that email." };
  const token = randomToken();
  const now = Date.now();
  await db
    .prepare("INSERT INTO invites (id, lab_id, email, role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(await sha256(token), labId, email || null, role, user.id, now, now + INVITE_DAYS * 86_400_000)
    .run();
  await audit("invite.created", { userId: user.id, labId, detail: { email: email || null, role } });
  refresh();
  return {
    ok: `Invite link for ${email || "anyone with the link"}, valid for ${INVITE_DAYS} days. It's shown once, so copy it now.`,
    link: `${await origin()}/invite/${token}`,
  };
}

export async function revokeInvite(form: FormData) {
  const user = await requireUser();
  const { db } = await bindings();
  const id = field(form, "invite");
  const row = await db.prepare("SELECT lab_id FROM invites WHERE id = ? AND used_at IS NULL").bind(id).first<{ lab_id: string }>();
  if (!row || !managesLab(user, row.lab_id)) return;
  await db.prepare("DELETE FROM invites WHERE id = ?").bind(id).run();
  await audit("invite.revoked", { userId: user.id, labId: row.lab_id });
  refresh();
}

// People

type Target = { id: string; email: string; role: string; lab_id: string | null };

async function target(id: string) {
  const { db } = await bindings();
  return db.prepare("SELECT id, email, role, lab_id FROM users WHERE id = ?").bind(id).first<Target>();
}

// Turning someone off signs them out at once. Owners can do this for their lab's members; the admin for anyone but admins.
export async function setUserDisabled(form: FormData) {
  const user = await requireUser();
  const t = await target(field(form, "user"));
  if (!t || t.role === "admin" || t.id === user.id || !t.lab_id) return;
  if (!isAdmin(user) && !(managesLab(user, t.lab_id) && t.role === "member")) notFound();
  const disabled = field(form, "disabled") === "1" ? 1 : 0;
  const { db } = await bindings();
  await db.batch([
    db.prepare("UPDATE users SET disabled = ? WHERE id = ?").bind(disabled, t.id),
    ...(disabled ? [db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(t.id)] : []),
  ]);
  await audit(disabled ? "user.disabled" : "user.enabled", { userId: user.id, labId: t.lab_id, detail: { user: t.id, email: t.email } });
  refresh();
}

export async function setUserRole(form: FormData) {
  const admin = await requireAdmin();
  const t = await target(field(form, "user"));
  if (!t || t.role === "admin") return;
  const role = field(form, "role") === "owner" ? "owner" : "member";
  if (role === t.role) return;
  const { db } = await bindings();
  await db.prepare("UPDATE users SET role = ? WHERE id = ?").bind(role, t.id).run();
  await audit("user.role_changed", { userId: admin.id, labId: t.lab_id, detail: { user: t.id, email: t.email, role } });
  refresh();
}

export async function removeUser(form: FormData) {
  const admin = await requireAdmin();
  const t = await target(field(form, "user"));
  if (!t || t.role === "admin") return;
  const { db } = await bindings();
  await db.prepare("DELETE FROM users WHERE id = ?").bind(t.id).run();
  await audit("user.removed", { userId: admin.id, labId: t.lab_id, detail: { user: t.id, email: t.email } });
  refresh();
}

// There is no email, so a forgotten password is fixed with a one-time link the admin passes on.
export async function createResetLink(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const t = await target(field(form, "user"));
  if (!t) return { error: "That account doesn't exist." };
  if (t.id === admin.id) return { error: "Change your own password from your account page." };
  const token = randomToken();
  const now = Date.now();
  const { db } = await bindings();
  await db.batch([
    db.prepare("DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL").bind(t.id),
    db
      .prepare("INSERT INTO password_resets (id, user_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(await sha256(token), t.id, admin.id, now, now + RESET_HOURS * 3_600_000),
  ]);
  await audit("password.reset_link", { userId: admin.id, labId: t.lab_id, detail: { user: t.id, email: t.email } });
  return { ok: `Reset link for ${t.email}, valid for ${RESET_HOURS} hours and usable once.`, link: `${await origin()}/reset/${token}` };
}

// Maintenance: uploads abandoned for over a day, and screenshots no task uses that are over a day old.
export async function runCleanup(_: FormState): Promise<FormState> {
  const admin = await requireAdmin();
  const { db, bucket } = await bindings();
  const stale = await staleUploads();
  let stepFiles = 0;
  for (const u of stale) {
    // An unfinished upload never became a task's current version, so its steps are safe to remove.
    stepFiles += await deletePrefix(stepsPrefix(u.lab_id, u.task_id, u.id));
    await db.prepare("DELETE FROM uploads WHERE id = ? AND finished_at IS NULL").bind(u.id).run();
  }
  let frames = 0;
  let bytes = 0;
  for (let batch = await orphanFrames(); batch.length; batch = await orphanFrames()) {
    await bucket.delete(batch.map((f) => frameKey(f.lab_id, f.hash)));
    const byLab = new Map<string, string[]>();
    for (const f of batch) byLab.set(f.lab_id, [...(byLab.get(f.lab_id) ?? []), f.hash]);
    for (const [lab, hashes] of byLab)
      for (let i = 0; i < hashes.length; i += 90) {
        const c = hashes.slice(i, i + 90);
        await db.prepare(`DELETE FROM lab_frames WHERE lab_id = ? AND hash IN (${c.map(() => "?").join(",")})`).bind(lab, ...c).run();
      }
    frames += batch.length;
    bytes += batch.reduce((n, f) => n + f.bytes, 0);
  }
  await audit("maintenance.cleanup", { userId: admin.id, detail: { uploads: stale.length, stepFiles, frames, bytes } });
  refresh();
  const mb = (bytes / 1e6).toFixed(1);
  return {
    ok:
      stale.length || frames
        ? `Removed ${stale.length} unfinished upload${stale.length === 1 ? "" : "s"} and ${frames} unused screenshot${frames === 1 ? "" : "s"} (${mb} MB).`
        : "Nothing to clean up.",
  };
}

// Share links (site admin, or the lab's owners): read-only access to published tasks for reviewers without an account.
export async function createShare(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const labId = field(form, "lab");
  if (!managesLab(user, labId)) return { error: "Only the lab's owners and the site admin can share its tasks." };
  const title = field(form, "title").slice(0, 120);
  const description = field(form, "description").slice(0, 2_000);
  const scope = field(form, "scope") === "tasks" ? "tasks" : "lab";
  const days = Number(field(form, "expires"));
  if (!title) return { error: "Give the link a title; reviewers see it at the top of every page." };
  const { db } = await bindings();
  if (!(await db.prepare("SELECT 1 FROM labs WHERE id = ? AND status = 'active'").bind(labId).first())) return { error: "Links can only be made for an active lab." };
  let taskIds: string[] = [];
  if (scope === "tasks") {
    const chosen = form.getAll("task").map(String);
    const { results } = await db.prepare("SELECT id FROM tasks WHERE lab_id = ? AND status = 'published'").bind(labId).all<{ id: string }>();
    const published = new Set(results.map((r) => r.id));
    taskIds = chosen.filter((id) => published.has(id));
    if (!taskIds.length) return { error: "Choose at least one published task, or share every published task." };
  }
  const id = newId("shr");
  const token = randomToken(24);
  const now = Date.now();
  await db.batch([
    db
      .prepare("INSERT INTO share_links (id, token, lab_id, title, description, scope, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, token, labId, title, description, scope, user.id, now, [7, 30, 90].includes(days) ? now + days * 86_400_000 : null),
    ...taskIds.map((t, i) => db.prepare("INSERT INTO share_tasks (share_id, task_id, position) VALUES (?, ?, ?)").bind(id, t, i)),
  ]);
  await audit("share.created", { userId: user.id, labId, detail: { title, scope, tasks: taskIds.length, days: days || null } });
  refresh();
  return { ok: `Share link made. Anyone with it can see ${scope === "lab" ? "every published task" : `${taskIds.length} task${taskIds.length === 1 ? "" : "s"}`} without signing in.`, link: `${await origin()}/v/${token}` };
}

export async function revokeShare(form: FormData) {
  const user = await requireUser();
  const { db } = await bindings();
  const row = await db.prepare("SELECT lab_id, title FROM share_links WHERE id = ? AND revoked_at IS NULL").bind(field(form, "share")).first<{ lab_id: string; title: string }>();
  if (!row || !managesLab(user, row.lab_id)) return;
  await db.prepare("UPDATE share_links SET revoked_at = ? WHERE id = ?").bind(Date.now(), field(form, "share")).run();
  await audit("share.revoked", { userId: user.id, labId: row.lab_id, detail: { title: row.title } });
  refresh();
}
