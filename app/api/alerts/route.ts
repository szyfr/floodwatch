import type { NextRequest } from "next/server"

import { apiError, json, readBody, readQuery, requireOfficial } from "@/lib/api"
import { getSessionUser } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { broadcast } from "@/lib/realtime/emit"
import { revalidateAlerts } from "@/lib/server/cache"
import { toAlert } from "@/lib/serialize"
import { listAlerts } from "@/lib/server/queries"
import { createAlertSchema, reportQuerySchema } from "@/lib/validation"

const scopeQuery = reportQuerySchema.pick({ lgu: true })

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

  const row = await prisma.alert.create({
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
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      areas: { create: areas.map((lgu) => ({ lguId: lgu.id })) },
    },
    include: {
      areas: { include: { lgu: { select: { slug: true, name: true } } } },
    },
  })

  const alert = toAlert(row, null)
  revalidateAlerts()
  broadcast("alert:created", alert, null)
  return json({ alert }, { status: 201 })
}
