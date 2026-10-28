import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UploadPanel } from "@/components/upload-panel";
import { requireUser } from "@/lib/server/auth";
import { getLab } from "@/lib/server/data";
import { bindings } from "@/lib/server/env";

export const metadata: Metadata = { title: "Upload tasks" };

export default async function UploadPage({ params }: { params: Promise<{ lab: string }> }) {
  const { lab: slug } = await params;
  const user = await requireUser();
  const lab = await getLab(user, slug);
  if (!lab) notFound();
  const { db } = await bindings();
  const { results } = await db
    .prepare("SELECT folder, id, name, status FROM tasks WHERE lab_id = ?")
    .bind(lab.id)
    .all<{ folder: string; id: string; name: string; status: "draft" | "published" }>();
  return <UploadPanel lab={{ id: lab.id, slug: lab.slug, name: lab.name }} existing={Object.fromEntries(results.map((r) => [r.folder, r]))} />;
}
