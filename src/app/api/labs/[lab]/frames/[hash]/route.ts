import { canSeeLab, currentUser } from "@/lib/server/auth";
import { bindings } from "@/lib/server/env";
import { frameKey, isFrameHash } from "@/lib/server/storage";

// A screenshot, only for people in the lab that owns it. Screenshots are named by content, so they never change.
export async function GET(_: Request, { params }: { params: Promise<{ lab: string; hash: string }> }) {
  const { lab, hash } = await params;
  const user = await currentUser();
  if (!user || !canSeeLab(user, lab) || !isFrameHash(hash)) return new Response("Not found.", { status: 404 });
  const { bucket } = await bindings();
  const object = await bucket.get(frameKey(lab, hash));
  if (!object) return new Response("Not found.", { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/webp",
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: object.httpEtag,
    },
  });
}
