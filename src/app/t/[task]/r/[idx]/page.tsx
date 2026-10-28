import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Player } from "@/components/player/player";
import { requireUser } from "@/lib/server/auth";
import { getTask } from "@/lib/server/data";

type Params = { task: string; idx: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { task: id, idx } = await params;
  const user = await requireUser();
  const task = await getTask(user, id);
  return { title: task ? `Run ${idx} · ${task.name}` : "Run" };
}

export default async function PlayerPage({ params }: { params: Promise<Params> }) {
  const { task: id, idx } = await params;
  const user = await requireUser();
  const task = await getTask(user, id);
  const n = Number(idx);
  if (!task || !task.rollouts.some((r) => r.idx === n)) notFound();
  return <Player key={`${id}:${n}`} task={task} idx={n} />;
}
