import { createHash } from "node:crypto"

import type { NextRequest } from "next/server"

import { apiError, json, readBody } from "@/lib/api"
import { prisma } from "@/lib/db"
import { isKnownPushService } from "@/lib/push/endpoints"
import { getWebPush, isPushConfigured } from "@/lib/push/vapid"
import { overLimit } from "@/lib/server/rate-limit"
import { pushEndpointSchema } from "@/lib/validation"

/**
 * One notification to one endpoint, sent inline and never through PushDispatch.
 *
 * This is how a resident sees that opting in did something, and how a support
 * call answers "is it actually ringing on this phone". Without it the first
 * proof the feature works is a real evacuation order.
 */
const PER_ENDPOINT = 3

export async function POST(request: NextRequest) {
  if (!isPushConfigured()) {
    return apiError("Push is not configured", 503, { code: "PUSH_OFF" })
  }

  const body = await readBody(request, pushEndpointSchema)
  if (body.response) return body.response
  const { endpoint } = body.data

  if (!isKnownPushService(endpoint)) {
    return apiError("Unknown push service", 422, {
      code: "INVALID",
      fields: { endpoint: "errEndpoint" },
    })
  }

  const key = createHash("sha256").update(endpoint).digest("base64url").slice(0, 24)
  if (overLimit(`push:test:${key}`, PER_ENDPOINT)) {
    return apiError("Too many test alerts", 429, { code: "RATE_LIMIT" })
  }

  const row = await prisma.pushSubscription.findUnique({
    where: { endpoint },
    select: { p256dh: true, auth: true, language: true },
  })
  if (!row) return apiError("This device is not subscribed", 404, { code: "NOT_FOUND" })

  const configured = getWebPush()
  if (!configured) {
    return apiError("Push is not configured", 503, { code: "PUSH_OFF" })
  }

  const tl = row.language === "tl"
  const payload = JSON.stringify({
    id: "test",
    title: tl ? "Gumagana ang mga alerto" : "Alerts are working",
    body: tl
      ? "Ganito ang hitsura ng babala sa baha sa telepono mo."
      : "This is how a flood alert will look on your phone.",
    type: "GENERAL",
    priority: "LOW",
  })

  try {
    await configured.webpush.sendNotification(
      { endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      payload,
      { agent: configured.agent, TTL: 60, urgency: "high" }
    )
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "statusCode" in error
        ? (error as { statusCode?: number }).statusCode
        : undefined
    // A test that finds a dead endpoint cleans it up, the same rule the
    // dispatcher applies. Everything else is reported, not swallowed, because
    // the whole point of this route is to surface the failure.
    if (status === 404 || status === 410) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint } })
      return apiError("This device is no longer reachable", 410, {
        code: "GONE",
      })
    }
    console.error("[push] test send failed", status, error)
    return apiError("Could not send a test alert", 502, { code: "PUSH_FAILED" })
  }

  return json({ sent: true })
}
