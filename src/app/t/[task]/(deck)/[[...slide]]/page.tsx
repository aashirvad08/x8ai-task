import type { Metadata } from "next";
import { requireUser } from "@/lib/server/auth";
import { getTask } from "@/lib/server/data";

type Params = { task: string; slide?: string[] };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { task: id } = await params;
  const user = await requireUser();
  return { title: (await getTask(user, id))?.name ?? "Task" };
}

// The deck itself renders in the layout; each page only gives the URL its own entry.
export default function DeckPage() {
  return null;
}
