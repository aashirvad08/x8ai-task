import { AdminNav } from "@/components/admin/nav";
import { requireAdmin } from "@/lib/server/auth";

// Every admin page checks the admin again itself; this only adds the section tabs.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="admin">
      <div className="admin-head">
        <p className="eyebrow">Site admin</p>
        <AdminNav />
      </div>
      {children}
    </div>
  );
}
