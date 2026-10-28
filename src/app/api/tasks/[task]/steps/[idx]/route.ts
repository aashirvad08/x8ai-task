import { currentUser } from "@/lib/server/auth";
import { getTask } from "@/lib/server/data";
import { bindings } from "@/lib/server/env";
import { stepsKey } from "@/lib/server/storage";

// One run's steps. Anyone who can't see the task gets the same "not found" as for a task that doesn't exist.
// Pages ask with ?v=<version>, so a re-uploaded task is never mixed with steps cached from the version before.
export async function GET(_: Request, { params }: { params: Promise<{ task: string; idx: string }> }) {
  const { task: id, idx } = await params;
  const user = await currentUser();
  const task = user && (await getTask(user, id));
  const run = task?.rollouts.find((r) => String(r.idx) === idx);
  if (!task || !run) return Response.json({ error: "Not found." }, { status: 404 });
  const { bucket } = await bindings();
  const object = await bucket.get(stepsKey(task.lab.id, task.id, task.version, run.idx));
  if (!object) return Response.json({ error: "This run has no recorded steps." }, { status: 404 });
  return new Response(object.body, {
    headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=3600" },
  });
}
