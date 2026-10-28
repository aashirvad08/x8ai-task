import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { ThemeMenu } from "@/components/theme-menu";
import { ShareView } from "@/components/view";
import { getShare } from "@/lib/server/share";

// Shared pages are private by link: kept out of search engines, and they don't pass the link on to sites they open.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ShareLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await getShare(token);
  if (!share)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <BrandMark className="brand-mark" />
            Run Deck
          </div>
          <h1>This link is no longer active</h1>
          <p className="auth-lede">It may have been revoked or have expired. If you think this is a mistake, ask the person who shared it for a new link.</p>
        </div>
      </main>
    );
  return (
    <ShareView token={token}>
      <div className="share-shell">
        <header className="topbar share-top">
          <div className="topbar-left">
            <Link href={`/v/${token}`} className="share-brand">
              <BrandMark className="brand-mark" />
              <span>{share.title}</span>
            </Link>
          </div>
          <div className="topbar-right">
            <span className="share-note">Shared privately by {share.lab.name}</span>
            <ThemeMenu />
          </div>
        </header>
        <main className="workspace-content">{children}</main>
      </div>
    </ShareView>
  );
}
