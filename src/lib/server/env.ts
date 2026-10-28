import { getCloudflareContext } from "@opennextjs/cloudflare";

// The database and bucket bindings: real ones on Cloudflare, local emulations under .wrangler/ during `next dev`.
export async function bindings() {
  const { env } = await getCloudflareContext({ async: true });
  return { db: env.DB, bucket: env.BUCKET };
}

export async function audit(action: string, opts: { userId?: string | null; labId?: string | null; detail?: unknown } = {}) {
  const { db } = await bindings();
  await db
    .prepare("INSERT INTO audit_log (at, user_id, lab_id, action, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(Date.now(), opts.userId ?? null, opts.labId ?? null, action, opts.detail === undefined ? null : JSON.stringify(opts.detail))
    .run();
}
