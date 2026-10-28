"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { createInvite, createLab, createResetLink, createShare, deleteLab, runCleanup, setUserRole, updateLab } from "@/app/admin/actions";
import { changePassword, resetPassword, signOutEverywhereElse, updateProfile, type FormState } from "@/app/actions";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

export function Message({ state }: { state: FormState }) {
  if (state?.error) return <p className="form-error">{state.error}</p>;
  if (state?.ok) return <p className="form-ok">{state.ok}</p>;
  return null;
}

// A link shown once, with a copy button: invite and password-reset links.
function OneTimeLink({ link, what }: { link: string; what: string }) {
  const toast = useToast();
  return (
    <div className="invite-link">
      <code>{link}</code>
      <button
        type="button"
        className="button button-outline button-sm"
        onClick={async () => {
          await navigator.clipboard.writeText(link).catch(() => {});
          toast(`${what} copied`);
        }}
      >
        <Copy size={13} /> Copy
      </button>
    </div>
  );
}

// A submit button that shows it's working while its form's action runs.
export function Submit({ children, pending: label, className, variant = "primary", disabled }: { children: React.ReactNode; pending?: string; className?: string; variant?: "primary" | "outline" | "ghost" | "danger"; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className={cn("button button-sm", variant === "danger" ? "button-danger" : `button-${variant}`, className)}
      disabled={pending || disabled}
    >
      {pending && label ? label : children}
    </button>
  );
}

export function CreateLabForm() {
  const [state, action] = React.useActionState(createLab, undefined);
  const form = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form action={action} ref={form} className="admin-form">
      <label className="field">
        <span>Lab name</span>
        <input name="name" required maxLength={120} placeholder="e.g. Northwind Agents Lab" />
      </label>
      <label className="field">
        <span>Short name (in links)</span>
        <input name="slug" placeholder="made from the name if empty" pattern="[a-zA-Z0-9 -]*" />
      </label>
      <label className="field field-wide">
        <span>Description (shown on the lab's overview)</span>
        <textarea name="description" rows={2} maxLength={2000} />
      </label>
      <div className="admin-form-foot">
        <Message state={state} />
        <Submit pending="Creating…">Create lab</Submit>
      </div>
    </form>
  );
}

// For the admin, a choice of lab; for a lab owner, their own lab only.
export function InviteForm({ labs, fixedLab }: { labs?: { id: string; name: string }[]; fixedLab?: string }) {
  const [state, action] = React.useActionState(createInvite, undefined);
  return (
    <form action={action} className="admin-form">
      {fixedLab ? (
        <input type="hidden" name="lab" value={fixedLab} />
      ) : (
        <label className="field">
          <span>Lab</span>
          <select name="lab" required defaultValue={labs?.[0]?.id}>
            {labs?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <span>Email (optional)</span>
        <input name="email" type="email" placeholder="anyone with the link if empty" />
      </label>
      <label className="field">
        <span>Role</span>
        <select name="role" defaultValue="member">
          <option value="member">Member</option>
          <option value="owner">Owner</option>
        </select>
        <small>Members view, upload and publish; owners can also invite people and delete tasks.</small>
      </label>
      <div className="admin-form-foot">
        <Message state={state} />
        <Submit pending="Creating…" disabled={!fixedLab && !labs?.length}>
          Create invite link
        </Submit>
      </div>
      {state?.link && <OneTimeLink link={state.link} what="Invite link" />}
    </form>
  );
}

export function LabSettingsForm({ lab }: { lab: { id: string; name: string; slug: string; description: string; criteria: string } }) {
  const [state, action] = React.useActionState(updateLab, undefined);
  return (
    <form action={action} className="admin-form">
      <input type="hidden" name="lab" value={lab.id} />
      <label className="field">
        <span>Lab name</span>
        <input name="name" required maxLength={120} defaultValue={lab.name} />
      </label>
      <label className="field">
        <span>Short name (in links: /labs/…)</span>
        <input name="slug" required pattern="[a-zA-Z0-9 -]*" defaultValue={lab.slug} />
      </label>
      <label className="field field-wide">
        <span>Description (shown on the lab's overview)</span>
        <textarea name="description" rows={3} maxLength={2000} defaultValue={lab.description} />
      </label>
      <label className="field field-wide">
        <span>Criteria achievement in the scores sheet</span>
        <select name="criteria" defaultValue={lab.criteria}>
          <option value="checks">Checks met ÷ all checks (best when runs are graded pass or fail)</option>
          <option value="score">The grader&apos;s task score (best when runs earn partial scores)</option>
        </select>
      </label>
      <div className="admin-form-foot">
        <Message state={state} />
        <Submit pending="Saving…">Save settings</Submit>
      </div>
    </form>
  );
}

export function DeleteLabForm({ lab }: { lab: { id: string; name: string } }) {
  const [state, action] = React.useActionState(deleteLab, undefined);
  const [typed, setTyped] = React.useState("");
  return (
    <form action={action} className="admin-form">
      <input type="hidden" name="lab" value={lab.id} />
      <label className="field field-wide">
        <span>Type {lab.name} to confirm</span>
        <input name="confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </label>
      <div className="admin-form-foot">
        <Message state={state} />
        <Submit variant="danger" pending="Deleting…" disabled={typed !== lab.name}>
          <Trash2 size={13} /> Delete this lab
        </Submit>
      </div>
    </form>
  );
}

export function ResetLinkForm({ user }: { user: string }) {
  const [state, action] = React.useActionState(createResetLink, undefined);
  return (
    <form action={action} className="reset-form">
      <input type="hidden" name="user" value={user} />
      <Submit variant="ghost" pending="Making…">
        <KeyRound size={13} /> Reset link
      </Submit>
      {(state?.error || state?.link) && (
        <div className="reset-result">
          <Message state={state?.error ? state : undefined} />
          {state?.link && <OneTimeLink link={state.link} what="Reset link" />}
        </div>
      )}
    </form>
  );
}

// Changing the select changes the role straight away.
export function RoleSelect({ user, role }: { user: string; role: "owner" | "member" }) {
  const [pending, start] = React.useTransition();
  return (
    <select
      className="inline-select"
      defaultValue={role}
      disabled={pending}
      aria-label="Role"
      onChange={(e) => {
        const f = new FormData();
        f.set("user", user);
        f.set("role", e.target.value);
        start(() => setUserRole(f));
      }}
    >
      <option value="member">Member</option>
      <option value="owner">Owner</option>
    </select>
  );
}

export function CleanupForm({ disabled }: { disabled: boolean }) {
  const [state, action] = React.useActionState(runCleanup, undefined);
  return (
    <form action={action} className="cleanup-form">
      <Submit pending="Cleaning up…" disabled={disabled}>
        Clean up now
      </Submit>
      <Message state={state} />
    </form>
  );
}

// Your account
export function ProfileForm({ name }: { name: string }) {
  const [state, action] = React.useActionState(updateProfile, undefined);
  return (
    <form action={action} className="admin-form">
      <label className="field field-wide">
        <span>Your name</span>
        <input name="name" maxLength={120} defaultValue={name} autoComplete="name" />
      </label>
      <div className="admin-form-foot">
        <Message state={state} />
        <Submit pending="Saving…">Save</Submit>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = React.useActionState(changePassword, undefined);
  const form = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form action={action} ref={form} className="admin-form">
      <label className="field">
        <span>Current password</span>
        <input name="current" type="password" required autoComplete="current-password" />
      </label>
      <label className="field">
        <span>New password</span>
        <input name="password" type="password" required minLength={10} autoComplete="new-password" />
      </label>
      <div className="admin-form-foot">
        <Message state={state} />
        <Submit pending="Changing…">Change password</Submit>
      </div>
    </form>
  );
}

export function SignOutOthersForm() {
  const [state, action] = React.useActionState(signOutEverywhereElse, undefined);
  return (
    <form action={action} className="cleanup-form">
      <Submit variant="outline" pending="Signing out…">
        Sign out everywhere else
      </Submit>
      <Message state={state} />
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = React.useActionState(resetPassword, undefined);
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="token" value={token} />
      <label className="field">
        <span>New password</span>
        <input name="password" type="password" required minLength={10} autoComplete="new-password" autoFocus />
        <small>At least 10 characters.</small>
      </label>
      <Message state={state} />
      <Submit pending="Saving…" className="auth-submit">
        Set password and sign in
      </Submit>
    </form>
  );
}

// A one-button form for a destructive action: the browser asks first.
export function ConfirmForm({
  action,
  fields,
  confirm,
  children,
  variant = "ghost",
}: {
  action: (form: FormData) => Promise<void>;
  fields: Record<string, string>;
  confirm: string;
  children: React.ReactNode;
  variant?: "ghost" | "danger";
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Submit variant={variant} pending="Working…">
        {children}
      </Submit>
    </form>
  );
}

// Filters the table rows below it by the text typed, matching name, email or lab.
export function TableSearch({ placeholder, target }: { placeholder: string; target: string }) {
  const [q, setQ] = React.useState("");
  React.useEffect(() => {
    const needle = q.trim().toLowerCase();
    document.querySelectorAll<HTMLTableRowElement>(`${target} tr[data-search]`).forEach((tr) => {
      tr.hidden = !!needle && !(tr.dataset.search ?? "").includes(needle);
    });
  }, [q, target]);
  return <input className="table-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} />;
}

// Make a share link: a title and note for reviewers, every published task or a chosen few, and an optional expiry.
export function ShareForm({ lab, tasks, defaultTitle }: { lab: string; tasks: { id: string; code: string; name: string }[]; defaultTitle: string }) {
  const [state, action] = React.useActionState(createShare, undefined);
  const [scope, setScope] = React.useState<"lab" | "tasks">("lab");
  return (
    <form action={action} className="admin-form">
      <input type="hidden" name="lab" value={lab} />
      <label className="field">
        <span>Title (reviewers see it on every page)</span>
        <input name="title" required maxLength={120} defaultValue={defaultTitle} />
      </label>
      <label className="field">
        <span>Expires</span>
        <select name="expires" defaultValue="30">
          <option value="7">After 7 days</option>
          <option value="30">After 30 days</option>
          <option value="90">After 90 days</option>
          <option value="">Never (until revoked)</option>
        </select>
      </label>
      <label className="field field-wide">
        <span>Note for reviewers (optional)</span>
        <textarea name="description" rows={2} maxLength={2000} />
      </label>
      <fieldset className="field field-wide scope-field">
        <legend>What it shows</legend>
        <label className="radio">
          <input type="radio" name="scope" value="lab" checked={scope === "lab"} onChange={() => setScope("lab")} />
          Every published task, including ones published later
        </label>
        <label className="radio">
          <input type="radio" name="scope" value="tasks" checked={scope === "tasks"} onChange={() => setScope("tasks")} disabled={!tasks.length} />
          Only the tasks I choose
        </label>
        {scope === "tasks" && (
          <div className="task-checks">
            {tasks.map((t) => (
              <label key={t.id} className="check">
                <input type="checkbox" name="task" value={t.id} />
                <span className="mono faint">{t.code}</span> {t.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <div className="admin-form-foot">
        <Message state={state} />
        <Submit pending="Making…">Make share link</Submit>
      </div>
      {state?.link && <OneTimeLink link={state.link} what="Share link" />}
    </form>
  );
}

export function CopyLinkButton({ path, label = "Copy link" }: { path: string; label?: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      className="button button-ghost button-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}${path}`).catch(() => {});
        toast("Share link copied");
      }}
    >
      <Copy size={13} /> {label}
    </button>
  );
}
