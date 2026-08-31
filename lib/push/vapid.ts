import "server-only"

import { Agent } from "node:https"

import webpush from "web-push"

/**
 * VAPID configuration, resolved lazily and never at module load.
 *
 * Follows lib/realtime/emit.ts's rule rather than lib/db.ts's: push is an
 * enhancement, so an unset key makes the feature inert instead of throwing and
 * taking a broadcast down with it. `bun run build` succeeds with none of these
 * set, the drawer row does not render, and POST /api/alerts still returns 201.
 *
 * VAPID_PUBLIC_KEY is deliberately NOT a NEXT_PUBLIC_ variable. That would be
 * inlined at `next build`, and a build does not run server.ts, so setting it
 * only in the systemd unit would hand the browser `undefined` - the exact trap
 * DEPLOYMENT.md documents for NEXT_PUBLIC_SOCKET_PATH. It is read here at
 * request time and passed to the client as a prop instead, which also makes
 * rotation a restart rather than a rebuild.
 */
export const PUSH_CONCURRENCY = 12

type Configured = { webpush: typeof webpush; agent: Agent }

const globalForVapid = globalThis as unknown as { __floodwatchVapid?: Configured }

function keys(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) return null
  return { publicKey, privateKey, subject }
}

export function isPushConfigured(): boolean {
  return keys() !== null
}

/** The public key the browser needs as `applicationServerKey`. */
export function publicVapidKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null
}

/**
 * The configured web-push module and one shared keep-alive agent, memoised on
 * globalThis so a province-wide broadcast reuses a handful of TLS connections
 * instead of renegotiating one per subscriber.
 *
 * web-push is CommonJS and `sendNotification` is a .bind() expression that
 * cjs-module-lexer may not lift into a named export, so it is imported as a
 * default and reached through the namespace.
 */
export function getWebPush(): Configured | null {
  const existing = globalForVapid.__floodwatchVapid
  if (existing) return existing
  const config = keys()
  if (!config) return null
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey)
  const created: Configured = {
    webpush,
    agent: new Agent({ keepAlive: true, maxSockets: PUSH_CONCURRENCY }),
  }
  globalForVapid.__floodwatchVapid = created
  return created
}
