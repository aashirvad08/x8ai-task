import type { Metadata } from "next";
import { getShare, shareTask } from "@/lib/server/share";

type Params = { token: string; task: string; slide?: string[] };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { token, task } = await params;
  const share = await getShare(token);
  return { title: (share && (await shareTask(share, task))?.name) ?? "Task" };
}

// The deck renders in the layout; each page only gives the URL its own entry.
export default function SharedDeckPage() {
  return null;
}
