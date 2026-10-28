import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Player } from "@/components/player/player";
import { getShare, shareTask } from "@/lib/server/share";

type Params = { token: string; task: string; idx: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { token, task: id, idx } = await params;
  const share = await getShare(token);
  const task = share && (await shareTask(share, id));
  return { title: task ? `Run ${idx} · ${task.name}` : "Run" };
}

export default async function SharedPlayer({ params }: { params: Promise<Params> }) {
  const { token, task: id, idx } = await params;
  const share = await getShare(token);
  const task = share && (await shareTask(share, id));
  const n = Number(idx);
  if (!task || !task.rollouts.some((r) => r.idx === n)) notFound();
  return <Player key={`${id}:${n}`} task={task} idx={n} />;
}
