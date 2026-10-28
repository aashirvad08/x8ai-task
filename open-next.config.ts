import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page depends on who is signed in, so nothing is cached between requests and no cache bucket is needed.
export default defineCloudflareConfig();
