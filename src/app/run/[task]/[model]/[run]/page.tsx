import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { getTask, legacyTurns } from "@/lib/server/data";
import { playerHref } from "@/lib/routes";

type Params = { task: string; model: string; run: string };

// Old run pages (/run/h937/fable/run1?step=12) now live in the player; their step numbers counted turns, not actions.
export default async function LegacyRun({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<{ step?: string }> }) {
  const p = await params;
  const { step } = await searchParams;
  const user = await requireUser();
  const task = await getTask(user, p.task);
  const r = task?.rollouts.find((x) => x.run === p.run && x.model.toLowerCase().startsWith(p.model));
  if (!task || !r) notFound();
  const turns = await legacyTurns(user, task.id, r.idx);
  const turn = Number(step);
  redirect(playerHref(task.id, r.idx, turns && turn >= 1 ? turns[Math.min(turns.length, turn) - 1] : undefined));
}
