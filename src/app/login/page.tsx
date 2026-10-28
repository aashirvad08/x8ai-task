import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, LoginForm } from "@/components/auth-forms";
import { currentUser } from "@/lib/server/auth";
import { bindings } from "@/lib/server/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  const { db } = await bindings();
  const hasAdmin = await db.prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").first();
  return (
    <AuthCard title="Sign in" lede="Your lab's tasks, runs and write-ups. Accounts are created from an invite link.">
      <LoginForm />
      {!hasAdmin && (
        <p className="auth-foot">
          First time running the site? <Link href="/setup">Create the admin account</Link>.
        </p>
      )}
    </AuthCard>
  );
}
