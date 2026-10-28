import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ShellGate } from "@/components/shell-gate";
import { ToastProvider } from "@/components/toast";
import { currentUser } from "@/lib/server/auth";
import { navFor } from "@/lib/server/data";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Run Deck", template: "%s · Run Deck" },
  description: "Labs post agent tasks and their recorded runs: each task as a deck (instruction, grading, blockers, results, failure modes, write-ups) and every run in a step-by-step player.",
};

// Applies the saved theme and sidebar state before paint so the page never flashes the wrong colours or layout.
const themeScript = `try{var d=document.documentElement;if(localStorage.getItem("theme")==="dark")d.dataset.theme="dark";if(localStorage.getItem("sidebar")==="collapsed")d.dataset.sidebar="collapsed"}catch(e){}`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  const nav = user ? await navFor(user) : [];
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ToastProvider>
          <ShellGate user={user} nav={nav}>
            {children}
          </ShellGate>
        </ToastProvider>
      </body>
    </html>
  );
}
