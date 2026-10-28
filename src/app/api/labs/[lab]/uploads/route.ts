import { badRequest, labWriter } from "@/lib/server/access";
import { newId } from "@/lib/server/crypto";
import { bindings } from "@/lib/server/env";

const FOLDER = /^[a-z0-9][a-z0-9-]{0,99}$/;
const suffix = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");

// Starts uploading one task. A folder name the lab already has means a new version of that task.
export async function POST(request: Request, { params }: { params: Promise<{ lab: string }> }) {
  const { lab } = await params;
  const auth = await labWriter(request, lab);
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as { folder?: unknown } | null;
  const folder = typeof body?.folder === "string" ? body.folder.toLowerCase() : "";
  if (!FOLDER.test(folder)) return badRequest("Task folder names use letters, digits and hyphens, up to 100 characters.");

  const { db } = await bindings();
  const existing = await db
    .prepare("SELECT id, name, status FROM tasks WHERE lab_id = ? AND folder = ?")
    .bind(lab, folder)
    .first<{ id: string; name: string; status: string }>();
  const id = newId("upl");
  // New tasks get a URL id of the folder name plus a short random part, so ids never collide across labs.
  const taskId = existing?.id ?? `${folder.slice(0, 48)}-${suffix()}`;
  await db
    .prepare("INSERT INTO uploads (id, lab_id, folder, task_id, replaces, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, lab, folder, taskId, existing ? 1 : 0, auth.user.id, Date.now())
    .run();
  return Response.json({ upload: id, task: taskId, replaces: existing ? { name: existing.name, status: existing.status } : null });
}
