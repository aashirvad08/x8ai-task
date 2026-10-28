import { notFound } from "next/navigation";
import { Deck } from "@/components/deck/deck";
import { getShare, shareNeighbours, shareTask } from "@/lib/server/share";

// The same deck as inside the lab, read-only, limited to the link's published tasks.
export default async function SharedDeckLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string; task: string }> }) {
  const { token, task: id } = await params;
  const share = await getShare(token);
  const task = share && (await shareTask(share, id));
  if (!share || !task) notFound();
  return (
    <>
      <Deck task={task} nav={await shareNeighbours(share, task)} canDelete={false} />
      {children}
    </>
  );
}
