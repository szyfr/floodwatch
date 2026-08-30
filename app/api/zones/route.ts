import type { NextRequest } from "next/server"

import { apiError, json, readBody, readQuery, requireOfficial } from "@/lib/api"
import { prisma } from "@/lib/db"
import { broadcast } from "@/lib/realtime/emit"
import { revalidateZones } from "@/lib/server/cache"
import { toZone } from "@/lib/serialize"
import { listZones } from "@/lib/server/queries"
import { createZoneSchema, reportQuerySchema } from "@/lib/validation"

const scopeQuery = reportQuerySchema.pick({ lgu: true })

export async function GET(request: NextRequest) {
  const query = readQuery(request, scopeQuery)
  if (query.response) return query.response

  const zones = await listZones(query.data.lgu ?? null)
  return json({ zones })
}

export async function POST(request: NextRequest) {
  const auth = await requireOfficial()
  if (auth.response) return auth.response

  const body = await readBody(request, createZoneSchema)
  if (body.response) return body.response
  const { lguSlug, ...input } = body.data

  const lgu = await prisma.lgu.findUnique({
    where: { slug: lguSlug },
    select: { id: true },
  })
  if (!lgu) {
    return apiError(`Unknown area: ${lguSlug}`, 422, {
      code: "INVALID",
      fields: { lguSlug: "generic" },
    })
  }

  const row = await prisma.safeZone.create({
    data: {
      ...input,
      capacity: input.capacity ?? null,
      contactName: input.contactName ?? null,
      contactPhone: input.contactPhone ?? null,
      lguId: lgu.id,
      createdById: auth.user.id,
    },
    include: { lgu: { select: { slug: true, name: true } } },
  })

  const zone = toZone(row)
  revalidateZones(zone.lguSlug)
  broadcast("zone:created", zone, zone.lguSlug)
  return json({ zone }, { status: 201 })
}
