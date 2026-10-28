import { buildSheet, toCsv } from "@/lib/sheet";
import { getShare, sharePayload } from "@/lib/server/share";

// One tab of a share link's scores sheet as CSV, for Google Sheets' IMPORTDATA: /api/v/<token>/sheet.csv?tab=summary|tasks|runs
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await getShare(token);
  if (!share) return new Response("This link is no longer active.\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const url = new URL(request.url);
  const key = url.searchParams.get("tab") ?? "summary";
  const base = `${url.origin}/v/${token}`;
  const payload = await sharePayload(share);
  const tabs = buildSheet(payload, { taskUrl: (t) => `${base}/t/${t}`, runUrl: (t, idx) => `${base}/t/${t}/r/${idx}` });
  const tab = tabs.find((t) => t.key === key);
  if (!tab) return Response.json({ error: `Unknown tab "${key}". Use summary, tasks or runs.` }, { status: 404 });
  return new Response(toCsv(tab), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
