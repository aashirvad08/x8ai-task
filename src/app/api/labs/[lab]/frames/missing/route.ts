import { badRequest, labWriter } from "@/lib/server/access";
import { bindings } from "@/lib/server/env";
import { isFrameHash } from "@/lib/server/storage";

// Of the screenshots an upload needs, the ones this lab doesn't have yet. Only those get sent.
export async function POST(request: Request, { params }: { params: Promise<{ lab: string }> }) {
  const { lab } = await params;
  const auth = await labWriter(request, lab);
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as { hashes?: unknown } | null;
  const hashes = Array.isArray(body?.hashes) ? [...new Set(body.hashes)] : null;
  if (!hashes || hashes.length > 50_000 || !hashes.every((h) => typeof h === "string" && isFrameHash(h))) return badRequest("Send a list of screenshot hashes.");

  const { db } = await bindings();
  const have = new Set<string>();
  // D1 allows at most 100 bound values per statement, so ask in chunks, all in one round trip.
  const chunks: string[][] = [];
  for (let i = 0; i < hashes.length; i += 90) chunks.push(hashes.slice(i, i + 90) as string[]);
  if (chunks.length) {
    const results = await db.batch(
      chunks.map((c) => db.prepare(`SELECT hash FROM lab_frames WHERE lab_id = ? AND hash IN (${c.map(() => "?").join(",")})`).bind(lab, ...c)),
    );
    for (const r of results) for (const row of r.results as { hash: string }[]) have.add(row.hash);
  }
  return Response.json({ missing: (hashes as string[]).filter((h) => !have.has(h)) });
}
