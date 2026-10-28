import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Overview } from "@/components/overview";
import { isAdmin, requireUser } from "@/lib/server/auth";
import { getLab, sheetPayload } from "@/lib/server/data";

type Params = { lab: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { lab: slug } = await params;
  const user = await requireUser();
  return { title: (await getLab(user, slug))?.name ?? "Lab" };
}

export default async function LabPage({ params }: { params: Promise<Params> }) {
  const { lab: slug } = await params;
  const user = await requireUser();
  const lab = await getLab(user, slug);
  if (!lab) notFound();
  return <Overview payload={await sheetPayload(lab)} canShare={isAdmin(user) || user.role === "owner"} />;
}
