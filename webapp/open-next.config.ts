import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// The app has no ISR/incremental cache needs: pages are client-rendered and
// API routes are dynamic, so no R2/KV binding is required.
export default defineCloudflareConfig({});
