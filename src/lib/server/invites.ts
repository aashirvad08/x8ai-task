import { sha256 } from "./crypto";
import { bindings } from "./env";

export type Invite = {
  id: string;
  lab_id: string;
  lab_name: string;
  lab_status: string;
  email: string | null;
  role: "owner" | "member";
  expires_at: number;
  used_at: number | null;
};

// Invite links carry a random token; the database only knows its SHA-256.
export async function findInvite(token: string) {
  if (!token) return null;
  const { db } = await bindings();
  return db
    .prepare(
      `SELECT i.id, i.lab_id, i.email, i.role, i.expires_at, i.used_at, l.status AS lab_status, l.name AS lab_name
         FROM invites i JOIN labs l ON l.id = i.lab_id WHERE i.id = ?`,
    )
    .bind(await sha256(token))
    .first<Invite>();
}

export const inviteUsable = (i: Invite | null): i is Invite => !!i && !i.used_at && i.expires_at > Date.now() && i.lab_status === "active";
