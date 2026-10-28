import type { Metadata } from "next";
import { PasswordForm, ProfileForm, SignOutOthersForm } from "@/components/admin/forms";
import { requireUser } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Your account" };

const ROLE = { admin: "Site admin", owner: "Lab owner", member: "Lab member" } as const;

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="admin account">
      <div className="admin-head">
        <p className="eyebrow">Your account</p>
        <h1>{user.name || user.email}</h1>
        <p>
          {user.email} · {ROLE[user.role]}
          {user.lab ? ` of ${user.lab.name}` : ""}
        </p>
      </div>
      <section className="admin-section admin-card">
        <h2 className="eyebrow">Name</h2>
        <ProfileForm name={user.name} />
      </section>
      <section className="admin-section admin-card">
        <h2 className="eyebrow">Password</h2>
        <PasswordForm />
      </section>
      <section className="admin-section admin-card">
        <h2 className="eyebrow">Other devices</h2>
        <p className="admin-note">Signs you out of every other browser and device, and keeps you signed in here.</p>
        <SignOutOthersForm />
      </section>
    </div>
  );
}
