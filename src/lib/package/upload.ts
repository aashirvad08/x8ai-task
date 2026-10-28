// Sends one checked task to the lab: screenshots the lab doesn't have yet, then each run's steps, then the task.
import type { PlannedTask } from "./inspect";

export type UploadPhase = "reading" | "screenshots" | "steps" | "saving";
export type UploadResult = { task: string; status: string; replaced: boolean };

const BATCH_BYTES = 12 * 1024 * 1024;
const BATCH_FILES = 100;
const PARALLEL = 3;

async function call<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `The server said ${res.status}.`);
  return body;
}
const postJson = <T>(url: string, data: unknown) => call<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });

export async function uploadTask(lab: string, planned: PlannedTask, onProgress: (phase: UploadPhase, done: number, total: number) => void): Promise<UploadResult> {
  const built = await planned.build((done, total) => onProgress("reading", done, total));
  const begin = await postJson<{ upload: string; task: string }>(`/api/labs/${lab}/uploads`, { folder: built.folder });

  const { missing } = await postJson<{ missing: string[] }>(`/api/labs/${lab}/frames/missing`, { hashes: [...built.frames.keys()] });
  // Pack screenshots into batches of up to 12 MB or 100 files, and keep a few batches in flight.
  const batches: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const hash of missing) {
    const f = built.frames.get(hash);
    if (!f) continue;
    if (current.length && (size + f.size > BATCH_BYTES || current.length >= BATCH_FILES)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(hash);
    size += f.size;
  }
  if (current.length) batches.push(current);
  let sent = 0;
  onProgress("screenshots", 0, missing.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, batches.length) }, async () => {
      while (next < batches.length) {
        const batch = batches[next++];
        const form = new FormData();
        for (const hash of batch) {
          const f = built.frames.get(hash) as { bytes: () => Promise<Uint8Array> };
          form.append(hash, new Blob([(await f.bytes()) as Uint8Array<ArrayBuffer>]), hash);
        }
        await call(`/api/labs/${lab}/frames`, { method: "POST", body: form });
        sent += batch.length;
        onProgress("screenshots", sent, missing.length);
      }
    }),
  );

  for (const [i, run] of built.runs.entries()) {
    onProgress("steps", i, built.runs.length);
    await call(`/api/labs/${lab}/uploads/${begin.upload}/steps/${run.idx}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(run.steps),
    });
  }
  onProgress("saving", 0, 1);
  return postJson<UploadResult>(`/api/labs/${lab}/uploads/${begin.upload}/finalize`, { task: built.task });
}
