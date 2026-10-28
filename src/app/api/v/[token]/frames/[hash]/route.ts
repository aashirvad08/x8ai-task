import { bindings } from "@/lib/server/env";
import { getShare, shareHasFrame } from "@/lib/server/share";
import { frameKey, isFrameHash } from "@/lib/server/storage";

// A screenshot through a share link: only if a task the link shows uses it.
export async function GET(_: Request, { params }: { params: Promise<{ token: string; hash: string }> }) {
  const { token, hash } = await params;
  const share = isFrameHash(hash) ? await getShare(token) : null;
  if (!share || !(await shareHasFrame(share, hash))) return new Response("Not found.", { status: 404 });
  const { bucket } = await bindings();
  const object = await bucket.get(frameKey(share.lab.id, hash));
  if (!object) return new Response("Not found.", { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/webp",
      // Shorter than inside the lab, so revoking a link also stops cached screenshots before long.
      "Cache-Control": "private, max-age=3600",
      "X-Robots-Tag": "noindex",
      ETag: object.httpEtag,
    },
  });
}
