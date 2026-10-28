import { badRequest, labWriter, notFound, openUpload } from "@/lib/server/access";
import { bindings } from "@/lib/server/env";
import { isFrameHash, stepsKey } from "@/lib/server/storage";
import { validateSteps } from "@/lib/server/task-schema";

const MAX_BYTES = 40 * 1024 * 1024;

// One run's steps for an upload in progress. They sit under the upload's own version until it is finished.
export async function PUT(request: Request, { params }: { params: Promise<{ lab: string; upload: string; idx: string }> }) {
  const { lab, upload: uploadId, idx } = await params;
  const auth = await labWriter(request, lab);
  if ("response" in auth) return auth.response;
  const upload = await openUpload(lab, uploadId);
  if (!upload) return notFound();
  const n = Number(idx);
  if (!Number.isInteger(n) || n < 0 || n > 1e6) return badRequest("Runs are numbered with whole numbers.");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) return badRequest("One run's steps can be at most 40 MB.");

  const body = await request.text();
  if (body.length > MAX_BYTES) return badRequest("One run's steps can be at most 40 MB.");
  let steps: unknown;
  try {
    steps = JSON.parse(body);
  } catch {
    return badRequest("The steps aren't valid JSON.");
  }
  const checked = validateSteps(steps, isFrameHash);
  if (!checked.ok) return badRequest(checked.error);
  const { bucket } = await bindings();
  await bucket.put(stepsKey(lab, upload.task_id, upload.id, n), body, { httpMetadata: { contentType: "application/json" } });
  return Response.json({ steps: checked.count });
}
