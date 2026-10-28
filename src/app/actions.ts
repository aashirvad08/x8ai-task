"use server";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { canSeeLab, currentUser, endSession, newUserId, requireUser, startSession } from "@/lib/server/auth";
import { hashPassword, randomToken, sha256, verifyPassword } from "@/lib/server/crypto";
import { audit, bindings } from "@/lib/server/env";
import { findInvite, inviteUsable } from "@/lib/server/invites";
import { field, passwordProblem, validEmail, type FormState } from "@/lib/server/forms";
import { collectFrames, deleteSteps, taskFrames } from "@/lib/server/tasks";

export type { FormState } from "@/lib/server/forms";

// A real hash to check against when the email is unknown, so a wrong email takes as long as a wrong password.
let decoy: Promise<string> | null = null;

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = field(form, "email");
  const password = String(form.get("password") ?? "");
  const { db } = await bindings();
  const user = await db
    .prepare(
      `SELECT u.id, u.password_hash, u.disabled, u.role, u.lab_id, l.status AS lab_status
         FROM users u LEFT JOIN labs l ON l.id = u.lab_id WHERE u.email = ?`,
    )
    .bind(email)
    .first<{ id: string; password_hash: string; disabled: number; role: string; lab_id: string | null; lab_status: string | null }>();
  const ok = await verifyPassword(password, user?.password_hash ?? (await (decoy ??= hashPassword(randomToken()))));
  if (!user || !ok) return { error: "That email and password don't match an account." };
  if (user.disabled) return { error: "This account has been turned off. Ask the site admin to turn it back on." };
  if (user.role !== "admin" && user.lab_status !== "active") return { error: "Your lab's access is paused. Ask the site admin for details." };
  await startSession(user.id);
  await audit("user.login", { userId: user.id, labId: user.lab_id });
  redirect("/");
}

export async function logout() {
  const user = await currentUser();
  await endSession();
  if (user) await audit("user.logout", { userId: user.id, labId: user.lab?.id });
  redirect("/login");
}

// First run only: the very first account becomes the site admin. On Cloudflare, set ADMIN_SETUP_TOKEN
// so nobody else can claim it between deploying and signing up.
export async function setupAdmin(_: FormState, form: FormData): Promise<FormState> {
  const { db } = await bindings();
  const existing = await db.prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").first();
  if (existing) return { error: "The site already has an admin. Sign in instead." };
  const { env } = await getCloudflareContext({ async: true });
  const setupToken = (env as unknown as Record<string, string | undefined>).ADMIN_SETUP_TOKEN ?? process.env.ADMIN_SETUP_TOKEN;
  if (setupToken && field(form, "token") !== setupToken) return { error: "That setup token isn't right." };
  const email = field(form, "email");
  const name = field(form, "name");
  const password = String(form.get("password") ?? "");
  if (!validEmail(email)) return { error: "Enter a valid email address." };
  const weak = passwordProblem(password);
  if (weak) return { error: weak };
  const id = newUserId();
  await db
    .prepare("INSERT INTO users (id, email, name, password_hash, role, lab_id, created_at) VALUES (?, ?, ?, ?, 'admin', NULL, ?)")
    .bind(id, email, name, await hashPassword(password), Date.now())
    .run();
  await audit("admin.created", { userId: id });
  await startSession(id);
  redirect("/admin");
}

export async function acceptInvite(_: FormState, form: FormData): Promise<FormState> {
  const invite = await findInvite(field(form, "token"));
  if (!inviteUsable(invite)) return { error: "This invite link has expired or was already used. Ask for a new one." };
  const email = invite.email ?? field(form, "email");
  const name = field(form, "name");
  const password = String(form.get("password") ?? "");
  if (!validEmail(email)) return { error: "Enter a valid email address." };
  const weak = passwordProblem(password);
  if (weak) return { error: weak };
  const { db } = await bindings();
  if (await db.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first()) return { error: "An account with that email already exists. Sign in instead." };
  const id = newUserId();
  const now = Date.now();
  // Claim the invite and create the account in one transaction; the claim fails if someone used the link a moment earlier.
  let claimed = 0;
  try {
    const [claim] = await db.batch([
      db.prepare("UPDATE invites SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(now, invite.id),
      db
        .prepare("INSERT INTO users (id, email, name, password_hash, role, lab_id, created_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1")
        .bind(id, email, name, await hashPassword(password), invite.role, invite.lab_id, now),
      db.prepare("UPDATE invites SET used_by = ? WHERE id = ? AND used_at = ?").bind(id, invite.id, now),
    ]);
    claimed = claim.meta.changes;
  } catch {
    return { error: "An account with that email already exists. Sign in instead." };
  }
  if (!claimed) return { error: "This invite link was already used. Ask for a new one." };
  await audit("user.joined", { userId: id, labId: invite.lab_id, detail: { role: invite.role } });
  await startSession(id);
  redirect("/");
}

// Tasks: publishing makes a draft part of the lab's deck; deleting removes the task, its steps and any screenshots
// no other task in the lab uses. Any lab member can publish; only lab owners and the site admin can delete.
async function changeableTask(id: string) {
  const user = await requireUser();
  const { db } = await bindings();
  const task = await db
    .prepare("SELECT t.id, t.lab_id, t.version, t.name, l.slug AS lab_slug FROM tasks t JOIN labs l ON l.id = t.lab_id WHERE t.id = ?")
    .bind(id)
    .first<{ id: string; lab_id: string; version: string; name: string; lab_slug: string }>();
  if (!task || !canSeeLab(user, task.lab_id)) notFound();
  return { user, task };
}

export async function setTaskStatus(form: FormData) {
  const { user, task } = await changeableTask(field(form, "task"));
  const status = field(form, "status") === "published" ? "published" : "draft";
  const { db } = await bindings();
  await db.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?").bind(status, Date.now(), task.id).run();
  await audit(status === "published" ? "task.published" : "task.unpublished", { userId: user.id, labId: task.lab_id, detail: { task: task.id } });
  revalidatePath("/", "layout");
}

export async function deleteTask(form: FormData) {
  const { user, task } = await changeableTask(field(form, "task"));
  if (user.role === "member") notFound();
  const frames = await taskFrames(task.id);
  const { db } = await bindings();
  await db.prepare("DELETE FROM tasks WHERE id = ?").bind(task.id).run();
  await deleteSteps(task.lab_id, task.id, task.version);
  const removed = await collectFrames(task.lab_id, frames);
  await audit("task.deleted", { userId: user.id, labId: task.lab_id, detail: { task: task.id, name: task.name, removed } });
  revalidatePath("/", "layout");
  const back = field(form, "back");
  redirect(back.startsWith("/admin") ? back : `/labs/${task.lab_slug}`);
}

// Your own account: name, password, and signing out everywhere else.
export async function updateProfile(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = field(form, "name").slice(0, 120);
  const { db } = await bindings();
  await db.prepare("UPDATE users SET name = ? WHERE id = ?").bind(name, user.id).run();
  await audit("user.profile", { userId: user.id, labId: user.lab?.id });
  revalidatePath("/", "layout");
  return { ok: "Saved." };
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("password") ?? "");
  const { db } = await bindings();
  const row = await db.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(current, row.password_hash))) return { error: "Your current password isn't right." };
  const weak = passwordProblem(next);
  if (weak) return { error: weak };
  await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(next), user.id).run();
  await signOutOtherSessions(user.id);
  await audit("password.changed", { userId: user.id, labId: user.lab?.id });
  return { ok: "Password changed. You're still signed in here; other devices were signed out." };
}

async function signOutOtherSessions(userId: string) {
  const token = (await cookies()).get("rd_session")?.value;
  const { db } = await bindings();
  await db.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").bind(userId, token ? await sha256(token) : "").run();
}

export async function signOutEverywhereElse(_: FormState): Promise<FormState> {
  const user = await requireUser();
  await signOutOtherSessions(user.id);
  return { ok: "Signed out of every other browser and device." };
}

// A reset link sets a new password once, signs out everywhere, and signs in here.
export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const token = field(form, "token");
  const next = String(form.get("password") ?? "");
  const weak = passwordProblem(next);
  if (weak) return { error: weak };
  const { db } = await bindings();
  const reset = await db
    .prepare("SELECT r.id, r.user_id, u.lab_id FROM password_resets r JOIN users u ON u.id = r.user_id WHERE r.id = ? AND r.used_at IS NULL AND r.expires_at > ? AND u.disabled = 0")
    .bind(await sha256(token), Date.now())
    .first<{ id: string; user_id: string; lab_id: string | null }>();
  if (!reset) return { error: "This reset link has expired or was already used. Ask the site admin for a new one." };
  const [claim] = await db.batch([
    db.prepare("UPDATE password_resets SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(Date.now(), reset.id),
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ? AND changes() = 1").bind(await hashPassword(next), reset.user_id),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(reset.user_id),
  ]);
  if (!claim.meta.changes) return { error: "This reset link was already used." };
  await audit("password.reset", { userId: reset.user_id, labId: reset.lab_id });
  await startSession(reset.user_id);
  redirect("/");
}
