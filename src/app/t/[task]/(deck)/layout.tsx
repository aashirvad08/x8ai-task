import { notFound } from "next/navigation";
import { Deck } from "@/components/deck/deck";
import { requireUser } from "@/lib/server/auth";
import { getTask, neighbours } from "@/lib/server/data";

// The deck lives in the layout so moving between its pages keeps the contents panel and any open step in place.
// A task in another lab looks exactly like one that doesn't exist.
export default async function DeckLayout({ children, params }: { children: React.ReactNode; params: Promise<{ task: string }> }) {
  const { task: id } = await params;
  const user = await requireUser();
  const task = await getTask(user, id);
  if (!task) notFound();
  return (
    <>
      <Deck task={task} nav={await neighbours(task)} canDelete={user.role !== "member"} />
      {children}
    </>
  );
}
