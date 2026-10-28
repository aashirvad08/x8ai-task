import { canSeeLab, currentUser, type SessionUser } from "./auth";
import { bindings } from "./env";

export const notFound = () => Response.json({ error: "Not found." }, { status: 404 });
export const badRequest = (error: string) => Response.json({ error }, { status: 400 });

// Changes come only from this site's own pages: a request that says it came from elsewhere is refused.
// (Session cookies are also SameSite=Lax, so browsers don't send them on cross-site posts.)
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

// Who may add to a lab: its own members and the site admin. Everyone else sees "not found".
export async function labWriter(request: Request, labId: string): Promise<{ user: SessionUser } | { response: Response }> {
  if (!sameOrigin(request)) return { response: Response.json({ error: "Cross-site request refused." }, { status: 403 }) };
  const user = await currentUser();
  if (!user || !canSeeLab(user, labId)) return { response: notFound() };
  const { db } = await bindings();
  if (!(await db.prepare("SELECT 1 FROM labs WHERE id = ? AND status = 'active'").bind(labId).first())) return { response: notFound() };
  return { user };
}

export type UploadRow = { id: string; lab_id: string; folder: string; task_id: string; replaces: number; finished_at: number | null };

// An upload that belongs to this lab and hasn't been finished yet.
export async function openUpload(labId: string, uploadId: string) {
  const { db } = await bindings();
  return db.prepare("SELECT id, lab_id, folder, task_id, replaces, finished_at FROM uploads WHERE id = ? AND lab_id = ?").bind(uploadId, labId).first<UploadRow>().then((u) => (u && !u.finished_at ? u : null));
}
