import Link from "next/link";
import { setTaskStatus, deleteTask } from "@/app/actions";
import { removeUser, revokeInvite, revokeShare, setUserDisabled } from "@/app/admin/actions";
import { ConfirmForm, CopyLinkButton, ResetLinkForm, RoleSelect, Submit } from "@/components/admin/forms";
import { describe } from "@/lib/activity-text";
import { fmtAgo, fmtBytes, fmtDate, fmtInt } from "@/lib/format";
import type { ActivityRow, InviteRow, PersonRow, ShareRow, TaskRow } from "@/lib/server/admin";
import { taskHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

const ROLE = { admin: "Site admin", owner: "Owner", member: "Member" } as const;

// mode "admin": every action; "owner": turn the lab's members off and on; "viewer": read only.
export function PeopleTable({ rows, mode, me, showLab }: { rows: PersonRow[]; mode: "admin" | "owner" | "viewer"; me: string; showLab?: boolean }) {
  if (!rows.length) return <p className="muted admin-empty">Nobody yet.</p>;
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>Person</th>
          {showLab && <th>Lab</th>}
          <th>Role</th>
          <th>Joined</th>
          <th>Last sign-in</th>
          {mode !== "viewer" && <th />}
        </tr>
      </thead>
      <tbody>
        {rows.map((u) => {
          const self = u.id === me;
          const canToggle = !self && u.role !== "admin" && (mode === "admin" || (mode === "owner" && u.role === "member"));
          return (
            <tr key={u.id} className={cn(u.disabled && "muted")} data-search={`${u.name} ${u.email} ${u.lab_name ?? ""}`.toLowerCase()}>
              <td>
                {u.name || u.email}
                {u.name && <span className="faint"> · {u.email}</span>}
                {self && <span className="faint"> (you)</span>}
              </td>
              {showLab && <td>{u.lab_slug ? <Link href={`/admin/labs/${u.lab_id}`} className="admin-link">{u.lab_name}</Link> : "-"}</td>}
              <td>{mode === "admin" && u.role !== "admin" ? <RoleSelect user={u.id} role={u.role as "owner" | "member"} /> : ROLE[u.role]}</td>
              <td>{fmtDate(u.created_at)}</td>
              <td>{u.disabled ? <span className="tone-fail">Turned off</span> : fmtAgo(u.last_login_at)}</td>
              {mode !== "viewer" && (
                <td className="actions">
                  <div className="row-actions">
                    {mode === "admin" && !self && <ResetLinkForm user={u.id} />}
                    {canToggle && (
                      <form action={setUserDisabled}>
                        <input type="hidden" name="user" value={u.id} />
                        <input type="hidden" name="disabled" value={u.disabled ? "0" : "1"} />
                        <Submit variant="ghost" pending="…">
                          {u.disabled ? "Turn on" : "Turn off"}
                        </Submit>
                      </form>
                    )}
                    {mode === "admin" && u.role !== "admin" && (
                      <ConfirmForm action={removeUser} fields={{ user: u.id }} confirm={`Remove ${u.email}? Their account is deleted; their uploads stay with the lab.`}>
                        Remove
                      </ConfirmForm>
                    )}
                  </div>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function InvitesTable({ rows, showLab, canRevoke }: { rows: InviteRow[]; showLab?: boolean; canRevoke: boolean }) {
  if (!rows.length) return <p className="muted admin-empty">No open invites.</p>;
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>For</th>
          {showLab && <th>Lab</th>}
          <th>Role</th>
          <th>Made by</th>
          <th>Expires</th>
          {canRevoke && <th />}
        </tr>
      </thead>
      <tbody>
        {rows.map((i) => (
          <tr key={i.id}>
            <td>{i.email ?? "Anyone with the link"}</td>
            {showLab && <td>{i.lab_name}</td>}
            <td>{ROLE[i.role as "owner" | "member"]}</td>
            <td>{i.by ?? "-"}</td>
            <td>{fmtDate(i.expires_at)}</td>
            {canRevoke && (
              <td className="actions">
                <form action={revokeInvite}>
                  <input type="hidden" name="invite" value={i.id} />
                  <Submit variant="ghost" pending="…">
                    Revoke
                  </Submit>
                </form>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TasksTable({ rows, showLab, back }: { rows: TaskRow[]; showLab?: boolean; back: string }) {
  if (!rows.length) return <p className="muted admin-empty">No tasks.</p>;
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>Task</th>
          {showLab && <th>Lab</th>}
          <th>Status</th>
          <th className="num">Runs</th>
          <th className="num">Steps</th>
          <th className="num">Size</th>
          <th>Updated</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id}>
            <td>
              <Link href={taskHref(t.id)} className="admin-link">
                {t.name}
              </Link>
              <span className="mono faint"> {t.folder}</span>
              {t.by && <div className="faint admin-sub">uploaded by {t.by}</div>}
            </td>
            {showLab && (
              <td>
                <Link href={`/admin/labs/${t.lab_id}`} className="admin-link">
                  {t.lab_name}
                </Link>
              </td>
            )}
            <td>{t.status === "draft" ? <span className="draft-tag">Draft</span> : <span className="tone-pass status">Published</span>}</td>
            <td className="num">{t.run_count}</td>
            <td className="num">{fmtInt(t.step_count)}</td>
            <td className="num">{fmtBytes(t.bytes)}</td>
            <td>{fmtAgo(t.updated_at)}</td>
            <td className="actions">
              <div className="row-actions">
                <form action={setTaskStatus}>
                  <input type="hidden" name="task" value={t.id} />
                  <input type="hidden" name="status" value={t.status === "draft" ? "published" : "draft"} />
                  <Submit variant="ghost" pending="…">
                    {t.status === "draft" ? "Publish" : "Unpublish"}
                  </Submit>
                </form>
                <ConfirmForm action={deleteTask} fields={{ task: t.id, back }} confirm={`Delete ${t.name} and its ${t.run_count} runs? This can't be undone.`}>
                  Delete
                </ConfirmForm>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ActivityList({ rows, showLab = true }: { rows: ActivityRow[]; showLab?: boolean }) {
  if (!rows.length) return <p className="muted admin-empty">Nothing yet.</p>;
  const now = Date.now();
  return (
    <ol className="activity">
      {rows.map((r) => (
        <li key={r.id}>
          <span className="activity-when" title={new Date(r.at).toLocaleString("en-GB")}>
            {fmtAgo(r.at, now)}
          </span>
          <span className="activity-what">{describe(r)}</span>
          {showLab && r.lab_id && r.lab_name && (
            <Link href={`/admin/labs/${r.lab_id}`} className="activity-lab">
              {r.lab_name}
            </Link>
          )}
        </li>
      ))}
    </ol>
  );
}

export function SharesTable({ rows }: { rows: ShareRow[] }) {
  if (!rows.length) return <p className="muted admin-empty">No share links yet.</p>;
  const now = Date.now();
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>Link</th>
          <th>Shows</th>
          <th>Made</th>
          <th>Expires</th>
          <th className="num">Views</th>
          <th>Last viewed</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => {
          const ended = s.revoked_at ? "Revoked" : s.expires_at && s.expires_at < now ? "Expired" : null;
          return (
            <tr key={s.id} className={cn(ended && "muted")}>
              <td>
                <strong className="share-title">{s.title}</strong>
                {ended && <span className="tone-fail"> · {ended}</span>}
              </td>
              <td>{s.scope === "lab" ? "Every published task" : `${s.tasks} chosen task${s.tasks === 1 ? "" : "s"}`}</td>
              <td>
                {fmtDate(s.created_at)}
                {s.by && <div className="faint admin-sub">by {s.by}</div>}
              </td>
              <td>{s.expires_at ? fmtDate(s.expires_at) : "Never"}</td>
              <td className="num">{fmtInt(s.views)}</td>
              <td>{fmtAgo(s.last_viewed_at)}</td>
              <td className="actions">
                {!ended && (
                  <div className="row-actions">
                    <CopyLinkButton path={`/v/${s.token}`} />
                    <a href={`/v/${s.token}`} target="_blank" rel="noreferrer" className="button button-ghost button-sm">
                      Open
                    </a>
                    <ConfirmForm action={revokeShare} fields={{ share: s.id }} confirm={`Revoke “${s.title}”? Anyone using it loses access at once.`}>
                      Revoke
                    </ConfirmForm>
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
