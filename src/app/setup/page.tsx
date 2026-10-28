import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { AuthCard, SetupForm } from "@/components/auth-forms";
import { bindings } from "@/lib/server/env";

export const metadata: Metadata = { title: "Set up" };

// Only until the first admin exists; after that it sends people to sign in.
export default async function SetupPage() {
  const { db } = await bindings();
  if (await db.prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").first()) redirect("/login");
  const { env } = await getCloudflareContext({ async: true });
  const needsToken = Boolean((env as unknown as Record<string, string | undefined>).ADMIN_SETUP_TOKEN ?? process.env.ADMIN_SETUP_TOKEN);
  return (
    <AuthCard title="Create the admin account" lede="This account runs the site: it creates labs, invites their people and can see every lab. Only one is needed.">
      <SetupForm needsToken={needsToken} />
    </AuthCard>
  );
}
