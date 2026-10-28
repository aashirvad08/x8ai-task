import { bindings } from "@/lib/server/env";
import { getShare, shareTask } from "@/lib/server/share";
import { stepsKey } from "@/lib/server/storage";

// One run's steps through a share link: only for a published task in the link's scope.
export async function GET(_: Request, { params }: { params: Promise<{ token: string; task: string; idx: string }> }) {
  const { token, task: id, idx } = await params;
  const share = await getShare(token);
  const task = share && (await shareTask(share, id));
  const run = task?.rollouts.find((r) => String(r.idx) === idx);
  if (!task || !run) return Response.json({ error: "Not found." }, { status: 404 });
  const { bucket } = await bindings();
  const object = await bucket.get(stepsKey(task.lab.id, task.id, task.version, run.idx));
  if (!object) return Response.json({ error: "This run has no recorded steps." }, { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=3600", "X-Robots-Tag": "noindex" } });
}
