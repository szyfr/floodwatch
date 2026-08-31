import { timingSafeEqual } from "node:crypto"

import type { NextRequest } from "next/server"

import { apiError, json } from "@/lib/api"
import { resumePushDispatches } from "@/lib/push/dispatch"

/**
 * Resumes any fan-out that never reached finishedAt. Poked by
 * floodwatch-push-sweep.timer once a minute, which is what makes a restart
 * mid-broadcast self-heal within a minute rather than at the next broadcast.
 *
 * A route handler rather than work started from server.ts, because only this
 * side of the process can import "server-only" modules and share lib/db.ts's
 * Prisma client. A drainer in the tsx graph would open a second pg pool under
 * systemd, since lib/db.ts parks its singleton on globalThis only outside
 * production.
 *
 * proxy.ts lets this through: a curl with no Origin and no sec-fetch-site is
 * not treated as cross-site.
 */
function authorised(request: NextRequest): boolean {
  const secret = process.env.PUSH_SWEEP_SECRET
  if (!secret) return false
  const offered = request.headers.get("x-push-sweep-secret") ?? ""
  const a = Buffer.from(offered)
  const b = Buffer.from(secret)
  // timingSafeEqual throws on a length mismatch, so that is checked first and
  // the compare only ever runs on equal-length buffers.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) {
    return apiError("Not found", 404, { code: "NOT_FOUND" })
  }
  const resumed = await resumePushDispatches()
  return json({ resumed })
}
