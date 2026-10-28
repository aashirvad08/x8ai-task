import { badRequest, labWriter } from "@/lib/server/access";
import { bindings } from "@/lib/server/env";
import { frameKey, isFrameHash } from "@/lib/server/storage";

const MAX_REQUEST = 16 * 1024 * 1024;
const MAX_FILE = 8 * 1024 * 1024;

// The image type from the file's first bytes; nothing but WebP, PNG and JPEG is stored.
function imageType(b: Uint8Array) {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

async function hashOf(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes as Uint8Array<ArrayBuffer>));
  return [...digest.slice(0, 10)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// A batch of screenshots as form fields named by their content hash. Each name is checked against the content,
// so a screenshot can't be stored under someone else's name.
export async function POST(request: Request, { params }: { params: Promise<{ lab: string }> }) {
  const { lab } = await params;
  const auth = await labWriter(request, lab);
  if ("response" in auth) return auth.response;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST) return badRequest("Send at most 16 MB of screenshots per request.");
  const form = await request.formData().catch(() => null);
  if (!form) return badRequest("Send screenshots as form data.");

  const { db, bucket } = await bindings();
  const now = Date.now();
  const stored: string[] = [];
  const rows: D1PreparedStatement[] = [];
  for (const [name, value] of form.entries()) {
    if (typeof value === "string") return badRequest(`${name} isn't a file.`);
    if (!isFrameHash(name)) return badRequest(`${name} isn't a screenshot hash.`);
    if (value.size > MAX_FILE) return badRequest(`Screenshot ${name} is over 8 MB.`);
    const bytes = new Uint8Array(await value.arrayBuffer());
    const type = imageType(bytes);
    if (!type) return badRequest(`Screenshot ${name} isn't a PNG, WebP or JPEG image.`);
    if ((await hashOf(bytes)) !== name) return badRequest(`Screenshot ${name} doesn't match its name.`);
    await bucket.put(frameKey(lab, name), bytes, { httpMetadata: { contentType: type } });
    rows.push(db.prepare("INSERT OR IGNORE INTO lab_frames (lab_id, hash, bytes, created_at) VALUES (?, ?, ?, ?)").bind(lab, name, bytes.length, now));
    stored.push(name);
  }
  if (rows.length) await db.batch(rows);
  return Response.json({ stored: stored.length });
}
