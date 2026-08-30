import type { NextRequest } from "next/server"

import { Prisma } from "@/generated/prisma/client"

import { json, notFound, readBody, readQuery, requireUser } from "@/lib/api"
import { getSessionUser } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { broadcast } from "@/lib/realtime/emit"
import { revalidateReports } from "@/lib/server/cache"
import { toPublicReport } from "@/lib/serialize"
import { getLguBySlug, getReport, listReports } from "@/lib/server/queries"
import { createReportSchema, reportQuerySchema } from "@/lib/validation"

/** Enough of the relations for the broadcast's public shape. */
const relations = {
  lgu: { select: { slug: true, name: true } },
  author: { select: { fullName: true, organisation: true } },
} as const

export async function GET(request: NextRequest) {
  const query = readQuery(request, reportQuerySchema)
  if (query.response) return query.response

  const viewer = await getSessionUser()
  const reports = await listReports(
    {
      lguSlug: query.data.lgu,
      level: query.data.level,
      recency: query.data.recency,
      sort: query.data.sort,
      limit: query.data.limit,
    },
    viewer?.id ?? null
  )
  return json({ reports })
}

export async function POST(request: NextRequest) {
  const auth = await requireUser()
  if (auth.response) return auth.response

  const body = await readBody(request, createReportSchema)
  if (body.response) return body.response
  const input = body.data

  const lgu = await getLguBySlug(input.lguSlug)
  if (!lgu) return notFound("Unknown area")

  // The offline queue stamps every report with a clientId, and
  // @@unique([authorId, clientId]) makes the replay exact: a retry of the same
  // queued report is a duplicate, a genuinely new one never is.
  if (input.clientId) {
    const replay = await prisma.floodReport.findUnique({
      where: {
        authorId_clientId: { authorId: auth.user.id, clientId: input.clientId },
      },
      select: { id: true },
    })
    if (replay) {
      const existing = await getReport(replay.id, auth.user.id)
      if (existing) return json({ report: existing }, { status: 409 })
    }
  }

  const created = await prisma.floodReport
    .create({
      data: {
        lguId: lgu.id,
        authorId: auth.user.id,
        clientId: input.clientId ?? null,
        locationName: input.locationName,
        description: input.description || null,
        waterLevel: input.waterLevel,
        lat: input.lat,
        lng: input.lng,
        photoUrl: input.photoUrl ?? null,
      },
      include: relations,
    })
    // Two retries of the same queued report can race past the check above.
    .catch(async (error: unknown) => {
      if (
        input.clientId &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return null
      }
      throw error
    })

  if (!created) {
    const existing = await prisma.floodReport.findUnique({
      where: {
        authorId_clientId: {
          authorId: auth.user.id,
          clientId: input.clientId!,
        },
      },
      select: { id: true },
    })
    const report = existing ? await getReport(existing.id, auth.user.id) : null
    if (report) return json({ report }, { status: 409 })
    return notFound("Report not found")
  }

  const report = await getReport(created.id, auth.user.id)
  if (!report) return notFound("Report not found")

  revalidateReports(created.lgu.slug)
  broadcast("report:created", toPublicReport(created), created.lgu.slug)

  return json({ report }, { status: 201 })
}
