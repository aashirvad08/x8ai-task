import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

// Gives `next dev` the same database and storage bindings the app has on Cloudflare, backed by local files in .wrangler/.
// RUN_DECK_STATE points it at another copy of that state instead, e.g. for trying things without touching the real one.
initOpenNextCloudflareForDev(process.env.RUN_DECK_STATE ? { persist: { path: process.env.RUN_DECK_STATE } } : undefined);

export default nextConfig;
