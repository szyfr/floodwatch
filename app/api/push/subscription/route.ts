import { createHash } from "node:crypto"

import type { NextRequest } from "next/server"

import { apiError, json, readBody } from "@/lib/api"
import { getSessionUser } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { isKnownPushService } from "@/lib/push/endpoints"
import { isPushConfigured } from "@/lib/push/vapid"
import { overLimit } from "@/lib/server/rate-limit"
import { pushEndpointSchema, pushSubscribeSchema } from "@/lib/validation"

/**
 * Device subscriptions. Both methods work signed out: the dashboard and alerts
 * screens already render without a session, and requiring an account before an
 * evacuation order costs reach for an accounting benefit.
 *
 * The endpoint is the identity and is a bearer capability, so the rate limit is
 * keyed on a hash of it rather than on an IP - Pampanga sits behind
 * carrier-grade NAT, the argument app/api/places/route.ts already makes.
 */
const PER_ENDPOINT = 10

function endpointKey(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("base64url").slice(0, 24)
}

export async function POST(request: NextRequest) {
  if (!isPushConfigured()) {
    return apiError("Push is not configured", 503, { code: "PUSH_OFF" })
  }

  const body = await readBody(request, pushSubscribeSchema)
  if (body.response) return body.response
  const input = body.data

  if (!isKnownPushService(input.endpoint)) {
    return apiError("Unknown push service", 422, {
      code: "INVALID",
      fields: { endpoint: "errEndpoint" },
    })
  }
  if (overLimit(`push:sub:${endpointKey(input.endpoint)}`, PER_ENDPOINT)) {
    return apiError("Too many subscription changes", 429, { code: "RATE_LIMIT" })
  }

  const viewer = await getSessionUser()
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint: input.endpoint },
    select: { id: true, userId: true, lguId: true, language: true },
  })

  // An endpoint rotation carries no area, so it inherits from the row it
  // replaces. Anything else must name one: a subscription with no area
  // receives no AREAS broadcast at all, and silence is the one failure nobody
  // thinks to report.
  const replaced = input.previousEndpoint
    ? await prisma.pushSubscription.findUnique({
        where: { endpoint: input.previousEndpoint },
        select: { userId: true, lguId: true, language: true },
      })
    : null

  const lgu = input.lgu
    ? await prisma.lgu.findUnique({
        where: { slug: input.lgu },
        select: { id: true },
      })
    : null
  const lguId = lgu?.id ?? replaced?.lguId ?? existing?.lguId ?? null
  if (!lguId) {
    return apiError("Unknown area", 422, {
      code: "INVALID",
      fields: { lgu: "errAreas" },
    })
  }
  const language = input.language ?? replaced?.language ?? existing?.language ?? "en"

  // Possession of the device is the authorisation, which is what lets a shared
  // barangay phone re-link to whoever signed in last. The one thing an
  // anonymous caller may not do is mutate a row that belongs to somebody:
  // otherwise a leaked endpoint could silently switch a resident off evacuation
  // orders, which is strictly worse than being able to push to them.
  if (existing && existing.userId !== null && !viewer) {
    return apiError("Sign in to change this device", 401, {
      code: "UNAUTHORIZED",
    })
  }

  const row = await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      lguId,
      userId: viewer?.id ?? replaced?.userId ?? null,
      language,
      userAgent: input.userAgent ?? null,
    },
    update: {
      p256dh: input.p256dh,
      auth: input.auth,
      lguId,
      // A signed-out re-assert must not orphan a row that has an owner.
      ...(viewer ? { userId: viewer.id } : {}),
      language,
      userAgent: input.userAgent ?? null,
      lastSeenAt: new Date(),
      failureCount: 0,
    },
    select: { id: true },
  })

  // How pushsubscriptionchange heals: the browser minted a new endpoint and
  // told us which one it replaces, so the dead row goes now instead of waiting
  // for the next broadcast's 410.
  if (input.previousEndpoint && input.previousEndpoint !== input.endpoint) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: input.previousEndpoint },
    })
  }

  return json({ subscribed: true, id: row.id }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const body = await readBody(request, pushEndpointSchema)
  if (body.response) return body.response

  if (overLimit(`push:sub:${endpointKey(body.data.endpoint)}`, PER_ENDPOINT)) {
    return apiError("Too many subscription changes", 429, { code: "RATE_LIMIT" })
  }

  // Unowned deletes are allowed even signed out: the caller proved possession
  // of the endpoint, and a row we refuse to drop here is one the next 410
  // reaps anyway. Turning alerts OFF should never be the hard path.
  await prisma.pushSubscription.deleteMany({
    where: { endpoint: body.data.endpoint },
  })
  return json({ subscribed: false })
}
