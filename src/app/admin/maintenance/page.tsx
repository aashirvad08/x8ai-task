import type { Metadata } from "next";
import Link from "next/link";
import { CleanupForm } from "@/components/admin/forms";
import { attention, labs, siteTotals, staleUploads } from "@/lib/server/admin";
import { requireAdmin } from "@/lib/server/auth";
import { fmtAgo, fmtBytes, fmtInt } from "@/lib/format";

export const metadata: Metadata = { title: "Storage · Admin" };

export default async function AdminMaintenance() {
  await requireAdmin();
  const [t, a, rows, stale] = await Promise.all([siteTotals(), attention(), labs(), staleUploads()]);
  const total = t.frameBytes + t.stepBytes;
  return (
    <>
      <section className="admin-section">
        <h2 className="eyebrow">Storage by lab · {fmtBytes(total)} in all</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Lab</th>
              <th className="num">Screenshots</th>
              <th className="num">Screenshot size</th>
              <th className="num">Steps size</th>
              <th className="num">Total</th>
              <th className="num">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const size = l.frameBytes + l.stepBytes;
              return (
                <tr key={l.id}>
                  <td>
                    <Link href={`/admin/labs/${l.id}`} className="admin-link">
                      {l.name}
                    </Link>
                  </td>
                  <td className="num">{fmtInt(l.frames)}</td>
                  <td className="num">{fmtBytes(l.frameBytes)}</td>
                  <td className="num">{fmtBytes(l.stepBytes)}</td>
                  <td className="num">{fmtBytes(size)}</td>
                  <td className="num">
                    <span className="share-cell">
                      <i style={{ width: `${total ? (size / total) * 100 : 0}%` }} />
                    </span>
                    {total ? Math.round((size / total) * 100) : 0}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="admin-section admin-card">
        <h2 className="eyebrow">Clean up</h2>
        <p className="admin-note">
          Removes uploads that were started over a day ago and never finished (someone closed the page partway), and screenshots that no task uses and that
          are over a day old (left by those uploads, or by tasks that were replaced). Tasks and their runs are never touched.
        </p>
        <ul className="attention">
          <li>
            {stale.length} unfinished upload{stale.length === 1 ? "" : "s"}
          </li>
          <li>
            {fmtInt(a.orphanFrames)} unused screenshot{a.orphanFrames === 1 ? "" : "s"} ({fmtBytes(a.orphanBytes)})
          </li>
        </ul>
        <CleanupForm disabled={!stale.length && !a.orphanFrames} />
        {stale.length > 0 && (
          <table className="admin-table admin-table-tight">
            <thead>
              <tr>
                <th>Unfinished upload</th>
                <th>Lab</th>
                <th>By</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {stale.map((u) => (
                <tr key={u.id}>
                  <td className="mono">{u.folder}</td>
                  <td>{u.lab_name}</td>
                  <td>{u.by ?? "-"}</td>
                  <td>{fmtAgo(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
