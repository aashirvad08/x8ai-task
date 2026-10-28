import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { newId, randomToken, sha256 } from "./crypto";
import { bindings } from "./env";

export type Role = "admin" | "owner" | "member";
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  lab: { id: string; slug: string; name: string } | null;
};

const COOKIE = "rd_session";
const SESSION_DAYS = 30;

type SessionRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  disabled: number;
  expires_at: number;
  lab_id: string | null;
  lab_slug: string | null;
  lab_name: string | null;
  lab_status: string | null;
};

// The signed-in user for this request, or null. A disabled user or a suspended lab counts as signed out.
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const { db } = await bindings();
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.disabled, s.expires_at,
              l.id AS lab_id, l.slug AS lab_slug, l.name AS lab_name, l.status AS lab_status
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN labs l ON l.id = u.lab_id
        WHERE s.id = ?`,
    )
    .bind(await sha256(token))
    .first<SessionRow>();
  if (!row || row.expires_at < Date.now() || row.disabled) return null;
  if (row.role !== "admin" && row.lab_status !== "active") return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    lab: row.lab_id ? { id: row.lab_id, slug: row.lab_slug as string, name: row.lab_name as string } : null,
  };
});

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

// Pages that aren't the admin's show "not found" rather than admitting they exist.
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") notFound();
  return user;
}

export const isAdmin = (u: SessionUser) => u.role === "admin";
export const canSeeLab = (u: SessionUser, labId: string) => isAdmin(u) || u.lab?.id === labId;

// Cookies are marked Secure whenever the site is served over https (always, on Cloudflare).
async function overHttps() {
  const h = await headers();
  return (h.get("origin") ?? h.get("referer") ?? "").startsWith("https://") || h.get("x-forwarded-proto") === "https";
}

export async function startSession(userId: string) {
  const { db } = await bindings();
  const token = randomToken();
  const now = Date.now();
  const expires = now + SESSION_DAYS * 86_400_000;
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
    db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256(token), userId, now, expires),
    db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(now, userId),
  ]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await overHttps(),
    path: "/",
    expires: new Date(expires),
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const { db } = await bindings();
    await db.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(token)).run();
  }
  jar.delete(COOKIE);
}

export const newUserId = () => newId("usr");
