import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Serves the service worker at /sw.js.
 *
 * It is a route handler rather than a file in public/ for two reasons, both
 * found the hard way:
 *
 * 1. `headers()` in next.config.ts does NOT apply to public/ assets on this
 *    version - the compiled rule sits in .next/routes-manifest.json and is
 *    simply not consulted for that branch, so the worker shipped as
 *    `public, max-age=0`. The `public` token invites Cloudflare to store it,
 *    and a stale service worker at the edge is close to unrecoverable:
 *    browsers keep running the old one, and an old worker is what silently
 *    turns an evacuation order into nothing.
 * 2. Next indexes public/ once at process startup in production, the trap
 *    app/uploads/[name]/route.ts already documents. A worker added to public/
 *    would 404 until the next restart, making deploy ordering load-bearing on
 *    a life-safety path. Here it cannot happen.
 *
 * The source stays authored as real JavaScript in worker/sw.js so `node
 * --check` can parse it and it is not swept into the app's tsconfig, which
 * cannot type a ServiceWorkerGlobalScope without breaking lib.dom. Deployment
 * is a full source checkout, so the file is always on the box.
 */
const SOURCE = readFileSync(join(process.cwd(), "worker", "sw.js"), "utf8")

export async function GET() {
  return new Response(SOURCE, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // `updateViaCache: "none"` at registration already makes the browser
      // bypass its own HTTP cache for this script; this is the half that keeps
      // shared caches out of it too.
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  })
}
