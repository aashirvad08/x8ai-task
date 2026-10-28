import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/auth";

// Lab members land on their lab; the admin lands on the admin page.
export default async function Home() {
  const user = await requireUser();
  redirect(user.lab ? `/labs/${user.lab.slug}` : "/admin");
}
