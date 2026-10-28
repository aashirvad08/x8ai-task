"use client";

import * as React from "react";
import Link from "next/link";
import { EyeOff, MoreHorizontal, Send, Trash2, Upload } from "lucide-react";
import { deleteTask, setTaskStatus } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Task } from "@/lib/types";

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

export function usePublish(task: Task) {
  const [pending, start] = React.useTransition();
  const set = (status: "draft" | "published") => start(() => setTaskStatus(form({ task: task.id, status })));
  return { pending, set };
}

// Shown above every page of a draft: who can see it, and the way to publish it.
export function DraftBanner({ task }: { task: Task }) {
  const { pending, set } = usePublish(task);
  return (
    <div className="draft-banner">
      <span>
        <b>Draft.</b> Only people in {task.lab.name} can see this task. Check it, then publish it to add it to the lab&apos;s tasks and scores.
      </span>
      <Button size="sm" variant="default" disabled={pending} onClick={() => set("published")}>
        <Send size={12} /> {pending ? "Publishing…" : "Publish"}
      </Button>
    </div>
  );
}

// The deck bar's task menu: publish or unpublish, upload a new version, delete.
export function TaskMenu({ task, canDelete }: { task: Task; canDelete: boolean }) {
  const { pending, set } = usePublish(task);
  const [confirm, setConfirm] = React.useState(false);
  const [deleting, startDelete] = React.useTransition();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="icon-round" aria-label="Task actions" title="Task actions">
            <MoreHorizontal size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {task.status === "draft" ? (
            <DropdownMenuItem disabled={pending} onSelect={() => set("published")}>
              <Send size={14} /> Publish
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={pending} onSelect={() => set("draft")}>
              <EyeOff size={14} /> Back to draft
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href={`/labs/${task.lab.slug}/upload`}>
              <Upload size={14} /> Upload a new version
            </Link>
          </DropdownMenuItem>
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="menu-danger" onSelect={() => setConfirm(true)}>
                <Trash2 size={14} /> Delete task
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="dialog-sm">
          <DialogTitle>Delete this task?</DialogTitle>
          <DialogDescription>
            {task.name} and its {task.rollouts.length} runs will be removed for everyone in {task.lab.name}, with their steps and any screenshots no other
            task uses. This can&apos;t be undone; uploading the package again brings it back as a draft.
          </DialogDescription>
          <div className="dialog-actions">
            <Button variant="outline" size="sm" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button size="sm" className="button-danger" disabled={deleting} onClick={() => startDelete(() => deleteTask(form({ task: task.id })))}>
              <Trash2 size={13} /> {deleting ? "Deleting…" : "Delete task"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
