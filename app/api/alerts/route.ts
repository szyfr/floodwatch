import { after, type NextRequest } from "next/server"

import { apiError, json, readBody, readQuery, requireOfficial } from "@/lib/api"
import { getSessionUser } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { dispatchAlert } from "@/lib/push/dispatch"
import { shouldPush } from "@/lib/push/policy"
import { isPushConfigured } from "@/lib/push/vapid"
import { broadcast } from "@/lib/realtime/emit"
import { revalidateAlerts } from "@/lib/server/cache"
import { toAlert } from "@/lib/serialize"
import { listAlerts } from "@/lib/server/queries"
import { createAlertSchema, reportQuerySchema } from "@/lib/validation"

const scopeQuery = reportQuerySchema.pick({ lgu: true })

/** Prisma's unique-constraint code, raised when a retry replays a clientId. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  )
}

export async function GET(request: NextRequest) {
  const query = readQuery(request, scopeQuery)
  if (query.response) return query.response

  const viewer = await getSessionUser()
  const alerts = await listAlerts(viewer?.id ?? null, query.data.lgu ?? null)
  return json({ alerts })
}

export async function POST(request: NextRequest) {
  const auth = await requireOfficial()
  if (auth.response) return auth.response

  const body = await readBody(request, createAlertSchema)
  if (body.response) return body.response
  const input = body.data

  // A province-wide alert stores no AlertArea rows - the scope enum carries it,
  // and listAlerts reads PROVINCE as "everyone" without touching the join table.
  const areas =
    input.scope === "AREAS"
      ? await prisma.lgu.findMany({
          where: { slug: { in: input.areas } },
          select: { id: true, slug: true },
        })
      : []
  const known = new Set(areas.map((lgu) => lgu.slug))
  const missing = input.areas.filter((slug) => !known.has(slug))
  if (input.scope === "AREAS" && missing.length > 0) {
    return apiError(`Unknown area: ${missing.join(", ")}`, 422, {
      code: "INVALID",
      fields: { areas: "errAreas" },
    })
  }

  // The dispatch row is written in the same transaction as the alert, so
  // "the broadcast exists" and "the broadcast is queued" can never disagree -
  // a crash between the two would otherwise be an order nobody is ever sent.
  const pushes = isPushConfigured() && shouldPush(input)

  const created = await prisma.alert
    .create({
      data: {
        title: input.title,
        titleTl: input.titleTl ?? null,
        message: input.message,
        messageTl: input.messageTl ?? null,
        type: input.type,
        priority: input.priority,
        scope: input.scope,
        // Residents are told which office spoke, not which officer typed it.
        sentBy: auth.user.organisation || auth.user.fullName,
        authorId: auth.user.id,
        clientId: input.clientId ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        areas: { create: areas.map((lgu) => ({ lguId: lgu.id })) },
        ...(pushes ? { dispatch: { create: {} } } : {}),
      },
      include: {
        areas: { include: { lgu: { select: { slug: true, name: true } } } },
      },
    })
    .catch(async (error: unknown) => {
      // A double-tapped Broadcast used to be untidy; it rings every phone in
      // the province twice now, and two ids will not collapse under one
      // notification tag. Same replay handling as app/api/reports/route.ts.
      if (!input.clientId || !isUniqueViolation(error)) throw error
      return prisma.alert.findFirst({
        where: { authorId: auth.user.id, clientId: input.clientId },
        include: {
          areas: { include: { lgu: { select: { slug: true, name: true } } } },
        },
      })
    })

  if (!created) return apiError("Could not file that broadcast", 500)

  const alert = toAlert(created, null)
  revalidateAlerts()
  broadcast("alert:created", alert, null)

  // Off the response's critical path, but not fire-and-forget: Next supplies a
  // real waitUntil on this server and server.ts's app.close() awaits it, so a
  // SIGTERM lets the current page finish instead of killing the fan-out. The
  // durability is the PushDispatch row above, not this call.
  if (pushes) {
    try {
      after(() => dispatchAlert(created.id))
    } catch (error) {
      // after() throws InvariantError once shutdown has begun. The sweep timer
      // picks the dispatch up within a minute, so this is a log, not a 500.
      console.error("[push] could not schedule dispatch", created.id, error)
    }
  }

  return json({ alert }, { status: 201 })
}
