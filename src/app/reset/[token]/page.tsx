import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-forms";
import { ResetPasswordForm } from "@/components/admin/forms";
import { sha256 } from "@/lib/server/crypto";
import { bindings } from "@/lib/server/env";

export const metadata: Metadata = { title: "Set a new password" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { db } = await bindings();
  const reset = await db
    .prepare("SELECT u.email FROM password_resets r JOIN users u ON u.id = r.user_id WHERE r.id = ? AND r.used_at IS NULL AND r.expires_at > ? AND u.disabled = 0")
    .bind(await sha256(token), Date.now())
    .first<{ email: string }>();
  if (!reset)
    return (
      <AuthCard title="This link can't be used" lede="It has expired or was already used. Ask the site admin for a new one.">
        <p className="auth-foot">
          Remember your password? <Link href="/login">Sign in</Link>.
        </p>
      </AuthCard>
    );
  return (
    <AuthCard title="Set a new password" lede={`For ${reset.email}. Every device signed in to this account is signed out.`}>
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
