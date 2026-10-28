import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Overview } from "@/components/overview";
import { getShare, recordView, sharePayload } from "@/lib/server/share";

type Params = { token: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { token } = await params;
  return { title: (await getShare(token))?.title ?? "Shared tasks" };
}

export default async function SharedOverview({ params }: { params: Promise<Params> }) {
  const { token } = await params;
  const share = await getShare(token);
  if (!share) notFound();
  await recordView(share);
  return <Overview payload={await sharePayload(share)} />;
}
