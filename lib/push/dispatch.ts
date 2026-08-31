import "server-only"

import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db"
import { buildPushPayload } from "@/lib/push/payload"
import { ttlSecondsFor, urgencyFor } from "@/lib/push/policy"
import { isStopping, pushState } from "@/lib/push/state"
import { getWebPush, isPushConfigured, PUSH_CONCURRENCY } from "@/lib/push/vapid"

/**
 * The fan-out. Called from after() on the alert write, and from the sweep route
 * when a dispatch never reached finishedAt.
 *
 * Semantics are at-least-once, deliberately. A push a service accepted but
 * whose outcome we never recorded is sent again after a restart: a duplicate
 * evacuation order is an annoyance, a dropped one is a life. The duplicate is
 * collapsed on the handset by the notification tag, which is the alert id.
 */

/** Subscriptions read per round trip. Also the resume granularity. */
const PAGE_SIZE = 500

/** Consecutive soft failures before a row is retired. */
const PUSH_FAILURE_LIMIT = 5

/**
 * How stale a dispatch may be and still be resumed. A box that was down for
 * three days must not wake the province on Friday with Tuesday's warning.
 */
const RESUME_MAX_AGE_MS = 2 * 60 * 60 * 1000

/** Consecutive 401/403s that abort a run - see the status policy below. */
const AUTH_FAILURE_ABORT = 20

/** Sends between event-loop yields, so the map still renders during a flood. */
const YIELD_EVERY = 8

type Target = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  language: string
}

type PageOutcome = {
  delivered: string[]
  gone: string[]
  soft: string[]
  failed: number
  authFailures: number
}

function statusOf(error: unknown): number | null {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const code = (error as { statusCode?: unknown }).statusCode
    if (typeof code === "number") return code
  }
  return null
}

/**
 * Resumable fan-out for one alert.
 *
 * Returns early rather than throwing on every "not our job" branch, because the
 * caller is after() and a throw there is only ever a console.error.
 */
export async function dispatchAlert(alertId: string): Promise<void> {
  if (!isPushConfigured()) return

  const state = pushState()
  // A sweep-triggered resume and a fresh broadcast can reach the same alert.
  // The Set is on globalThis precisely so this check works across both graphs.
  if (state.running.has(alertId)) return
  state.running.add(alertId)

  try {
    await run(alertId)
  } catch (error) {
    console.error("[push] dispatch failed", alertId, error)
  } finally {
    state.running.delete(alertId)
  }
}

async function run(alertId: string): Promise<void> {
  const configured = getWebPush()
  if (!configured) return

  const dispatch = await prisma.pushDispatch.findUnique({
    where: { alertId },
    select: { id: true, cursor: true, finishedAt: true },
  })
  if (!dispatch || dispatch.finishedAt) return

  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    select: {
      id: true,
      title: true,
      titleTl: true,
      message: true,
      messageTl: true,
      type: true,
      priority: true,
      scope: true,
      active: true,
      expiresAt: true,
      areas: { select: { lguId: true } },
    },
  })
  if (!alert) return

  // A resume must never deliver an order that has since been withdrawn.
  const expired = alert.expiresAt !== null && alert.expiresAt.getTime() <= Date.now()
  if (!alert.active || expired) {
    await prisma.pushDispatch.update({
      where: { id: dispatch.id },
      data: { finishedAt: new Date() },
    })
    return
  }

  // A PROVINCE alert stores no AlertArea rows, so there is no join that can
  // express it. `{}` - every subscription - is the correct predicate. Writing
  // this as `{ lgu: { alertAreas: { some: { alertId } } } }` looks tidier and
  // returns ZERO rows for exactly the province-wide evacuation order you most
  // need to deliver.
  const where: Prisma.PushSubscriptionWhereInput =
    alert.scope === "PROVINCE"
      ? {}
      : { lguId: { in: alert.areas.map((area) => area.lguId) } }

  const ttl = ttlSecondsFor(alert)
  const urgency = urgencyFor(alert)
  const startedAt = Date.now()
  let cursor = dispatch.cursor
  let matched = 0
  let delivered = 0
  let gone = 0
  let failed = 0

  for (;;) {
    if (isStopping()) break

    const page: Target[] = await prisma.pushSubscription.findMany({
      where: cursor ? { AND: [where, { id: { gt: cursor } }] } : where,
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      select: {
        id: true,
        endpoint: true,
        p256dh: true,
        auth: true,
        language: true,
      },
    })
    if (page.length === 0) break

    const outcome = await sendPage(page, alert, ttl, urgency)
    matched += page.length
    delivered += outcome.delivered.length
    gone += outcome.gone.length
    failed += outcome.failed
    cursor = page[page.length - 1].id

    // One write per outcome class, not one per message.
    if (outcome.delivered.length > 0) {
      await prisma.pushSubscription.updateMany({
        where: { id: { in: outcome.delivered } },
        data: { lastSeenAt: new Date(), failureCount: 0 },
      })
    }
    if (outcome.gone.length > 0) {
      await prisma.pushSubscription.deleteMany({
        where: { id: { in: outcome.gone } },
      })
    }
    if (outcome.soft.length > 0) {
      await prisma.pushSubscription.updateMany({
        where: { id: { in: outcome.soft } },
        data: { failureCount: { increment: 1 } },
      })
      await prisma.pushSubscription.deleteMany({
        where: {
          id: { in: outcome.soft },
          failureCount: { gte: PUSH_FAILURE_LIMIT },
        },
      })
    }

    await prisma.pushDispatch.update({
      where: { id: dispatch.id },
      data: { cursor, matched, delivered, gone, failed },
    })

    // A mis-set private key would otherwise walk the whole province rejecting
    // every send. Stop and let someone read the log.
    if (outcome.authFailures >= AUTH_FAILURE_ABORT) {
      console.error(
        `[push] dispatch ${dispatch.id} aborted: ${outcome.authFailures} consecutive 401/403 responses - check VAPID_PRIVATE_KEY. No subscriptions were deleted.`
      )
      return
    }

    if (page.length < PAGE_SIZE) break
  }

  if (isStopping()) return

  await prisma.pushDispatch.update({
    where: { id: dispatch.id },
    data: { cursor, matched, delivered, gone, failed, finishedAt: new Date() },
  })
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(
    `[push] dispatch ${dispatch.id} alert=${alertId} matched=${matched} delivered=${delivered} gone=${gone} failed=${failed} in ${seconds}s`
  )
}

/**
 * Sends one page through a bounded pool over the shared keep-alive agent.
 *
 * The yield is INSIDE the page rather than between pages: web-push does an
 * ECDH, an HKDF and an AES-GCM per message, and this is the same event loop
 * serving the map to everyone who just opened the app because of this alert.
 */
async function sendPage(
  page: Target[],
  alert: Parameters<typeof buildPushPayload>[0],
  ttl: number,
  urgency: "normal" | "high"
): Promise<PageOutcome> {
  const configured = getWebPush()
  if (!configured) {
    return { delivered: [], gone: [], soft: [], failed: 0, authFailures: 0 }
  }

  const outcome: PageOutcome = {
    delivered: [],
    gone: [],
    soft: [],
    failed: 0,
    authFailures: 0,
  }
  let next = 0
  let sinceYield = 0

  async function worker(): Promise<void> {
    for (;;) {
      if (isStopping()) return
      const index = next++
      if (index >= page.length) return
      const target = page[index]

      try {
        await configured!.webpush.sendNotification(
          {
            endpoint: target.endpoint,
            keys: { p256dh: target.p256dh, auth: target.auth },
          },
          buildPushPayload(alert, target.language),
          { agent: configured!.agent, TTL: ttl, urgency }
        )
        outcome.delivered.push(target.id)
        outcome.authFailures = 0
      } catch (error) {
        const status = statusOf(error)
        if (status === 404 || status === 410) {
          // The endpoint is gone: a wiped phone, or an uninstalled app. This is
          // the only cleanup path that matters, and it also repairs a DELETE
          // that failed after the browser-side unsubscribe() succeeded.
          outcome.gone.push(target.id)
          outcome.authFailures = 0
        } else if (status === 401 || status === 403) {
          // Our key is wrong, not their phone. NEVER delete a row for this: one
          // mis-set VAPID_PRIVATE_KEY would wipe every subscriber in the
          // province on the first broadcast and every resident would have to
          // opt in again. This is the most damaging mistake available here.
          outcome.failed += 1
          outcome.authFailures += 1
        } else if (status === 400 || status === 413) {
          // Our bug. payload.ts's cap is meant to make 413 impossible.
          console.error("[push] rejected payload", alert.id, status, error)
          outcome.failed += 1
          outcome.authFailures = 0
        } else {
          outcome.soft.push(target.id)
          outcome.failed += 1
          outcome.authFailures = 0
        }
      }

      sinceYield += 1
      if (sinceYield >= YIELD_EVERY) {
        sinceYield = 0
        await new Promise((resolve) => setImmediate(resolve))
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PUSH_CONCURRENCY, page.length) }, worker)
  )
  return outcome
}

/**
 * Resumes every dispatch that never finished, oldest first.
 *
 * Called by the sweep route on a systemd timer. Selecting orphans and running
 * them is sound without any lease or lock ONLY because there is exactly one
 * process - the same guarantee lib/server/rate-limit.ts leans on - with
 * pushState().running as the guard against overlapping with a live fan-out.
 */
export async function resumePushDispatches(): Promise<number> {
  if (!isPushConfigured()) return 0

  const stale = await prisma.pushDispatch.findMany({
    where: {
      finishedAt: null,
      startedAt: { gte: new Date(Date.now() - RESUME_MAX_AGE_MS) },
    },
    orderBy: { startedAt: "asc" },
    select: { alertId: true },
    take: 20,
  })

  let resumed = 0
  for (const row of stale) {
    if (isStopping()) break
    if (pushState().running.has(row.alertId)) continue
    await dispatchAlert(row.alertId)
    resumed += 1
  }
  return resumed
}
