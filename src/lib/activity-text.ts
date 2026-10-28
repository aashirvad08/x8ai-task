// Turns an activity-log entry into a sentence a person can read: "Carol uploaded Fix the Failing Price Test".

export type ActivityEntry = {
  action: string;
  detail: string | null;
  user_name: string | null;
  user_email: string | null;
  user_id: string | null;
  lab_name: string | null;
};

export const ACTIVITY_KINDS: { id: string; label: string }[] = [
  { id: "task", label: "Tasks" },
  { id: "user", label: "Sign-ins and accounts" },
  { id: "invite", label: "Invites" },
  { id: "lab", label: "Labs" },
  { id: "password", label: "Passwords" },
  { id: "share", label: "Share links" },
  { id: "maintenance", label: "Maintenance" },
];

export function describe(e: ActivityEntry) {
  let d: Record<string, unknown> = {};
  try {
    d = e.detail ? (JSON.parse(e.detail) as Record<string, unknown>) : {};
  } catch {}
  const who = e.user_name || e.user_email || (e.user_id ? "A removed account" : "The system");
  const lab = e.lab_name ?? "a deleted lab";
  const task = (d.name as string) || (d.folder as string) || (d.task as string) || "a task";
  const n = (k: string) => Number(d[k] ?? 0).toLocaleString("en-US");
  switch (e.action) {
    case "user.login":
      return `${who} signed in`;
    case "user.logout":
      return `${who} signed out`;
    case "user.joined":
      return `${who} joined ${lab} as ${d.role === "owner" ? "an owner" : "a member"}`;
    case "user.disabled":
      return `${who} turned off ${(d.email as string) ?? "an account"}`;
    case "user.enabled":
      return `${who} turned ${(d.email as string) ?? "an account"} back on`;
    case "user.role_changed":
      return `${who} made ${(d.email as string) ?? "an account"} ${d.role === "owner" ? "an owner" : "a member"} of ${lab}`;
    case "user.removed":
      return `${who} removed ${(d.email as string) ?? "an account"} from ${lab}`;
    case "user.profile":
      return `${who} changed their name`;
    case "admin.created":
      return `${who} created the admin account`;
    case "password.changed":
      return `${who} changed their password`;
    case "password.reset_link":
      return `${who} made a password reset link for ${(d.email as string) ?? "an account"}`;
    case "password.reset":
      return `${who} set a new password from a reset link`;
    case "invite.created":
      return `${who} invited ${(d.email as string) || "anyone with the link"} to ${lab} as ${d.role === "owner" ? "an owner" : "a member"}`;
    case "invite.revoked":
      return `${who} revoked an invite to ${lab}`;
    case "lab.created":
      return `${who} created ${(d.name as string) ?? lab}`;
    case "lab.updated":
      return `${who} changed ${lab}'s settings`;
    case "lab.suspended":
      return `${who} paused ${lab}'s access`;
    case "lab.activated":
      return `${who} restored ${lab}'s access`;
    case "lab.deleted":
      return `${who} deleted the lab ${(d.name as string) ?? ""}`.trim();
    case "task.uploaded":
      return `${who} uploaded ${task} (${n("runs")} runs, ${n("steps")} steps) to ${lab}`;
    case "task.replaced":
      return `${who} uploaded a new version of ${task} in ${lab}`;
    case "task.published":
      return `${who} published ${task} in ${lab}`;
    case "task.unpublished":
      return `${who} moved ${task} in ${lab} back to draft`;
    case "task.deleted":
      return `${who} deleted ${task} from ${lab}`;
    case "share.created":
      return `${who} made a share link “${d.title as string}” for ${d.scope === "lab" ? "every published task" : `${n("tasks")} tasks`} in ${lab}`;
    case "share.revoked":
      return `${who} revoked the share link “${d.title as string}” in ${lab}`;
    case "seed.imported":
      return `${n("tasks")} tasks were loaded into ${lab} from the local data folder`;
    case "maintenance.cleanup":
      return `${who} cleaned up storage: ${n("uploads")} unfinished uploads and ${n("frames")} unused screenshots`;
    default:
      return `${who}: ${e.action}${e.lab_name ? ` in ${lab}` : ""}`;
  }
}
