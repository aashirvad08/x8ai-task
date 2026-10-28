import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard, InviteForm } from "@/components/auth-forms";
import { currentUser } from "@/lib/server/auth";
import { findInvite, inviteUsable } from "@/lib/server/invites";

export const metadata: Metadata = { title: "Join a lab" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await findInvite(token);
  if (!inviteUsable(invite)) {
    return (
      <AuthCard title="This invite can't be used" lede="It has expired, was already used, or the lab's access is paused. Ask whoever sent it for a new link.">
        <p className="auth-foot">
          Already have an account? <Link href="/login">Sign in</Link>.
        </p>
      </AuthCard>
    );
  }
  const user = await currentUser();
  return (
    <AuthCard
      title={`Join ${invite.lab_name}`}
      lede={`You've been invited as a lab ${invite.role}. Create an account to see ${invite.lab_name}'s tasks and runs.`}
    >
      {user && <p className="form-error">You're signed in as {user.email}. Creating this account will sign you in as the new one instead.</p>}
      <InviteForm token={token} email={invite.email} />
      <p className="auth-foot">
        Already have an account? <Link href="/login">Sign in</Link>.
      </p>
    </AuthCard>
  );
}
