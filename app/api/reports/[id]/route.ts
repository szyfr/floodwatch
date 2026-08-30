import type { NextRequest } from "next/server"

import { forbidden, json, notFound, readBody, requireUser } from "@/lib/api"
import { getSessionUser } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import type { WaterLevel } from "@/lib/domain"
import { broadcast } from "@/lib/realtime/emit"
import { revalidateReports } from "@/lib/server/cache"
import { toPublicReport } from "@/lib/serialize"
import { getLguBySlug, getReport } from "@/lib/server/queries"
import { updateReportSchema } from "@/lib/validation"

type Context = { params: Promise<{ id: string }> }

/** Just enough of the row to decide who may touch it and where to broadcast. */
function loadOwnership(id: string) {
  return prisma.floodReport.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, authorId: true, lgu: { select: { slug: true } } },
  })
}

export async function GET(request: NextRequest, { params }: Context) {
  const { id } = await params
  const viewer = await getSessionUser()
  const report = await getReport(id, viewer?.id ?? null)
  if (!report) return notFound("Report not found")
  return json({ report })
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const { id } = await params

  const auth = await requireUser()
  if (auth.response) return auth.response

  const body = await readBody(request, updateReportSchema)
  if (body.response) return body.response
  const { verified, ...content } = body.data

  const existing = await loadOwnership(id)
  if (!existing) return notFound("Report not found")

  // Content is the author's to edit and the DRRM office's to correct on any
  // report — the office works the whole province from the report console, where
  // a mislabelled water level or a pin in the wrong barangay is theirs to fix.
  // Verification stays the office's alone.
  const isOfficial = auth.user.role === "OFFICIAL"
  const editsContent = Object.values(content).some((v) => v !== undefined)
  if (editsContent && existing.authorId !== auth.user.id && !isOfficial) {
    return forbidden()
  }
  if (verified !== undefined && !isOfficial) return forbidden()

  const data: {
    lguId?: string
    locationName?: string
    description?: string | null
    waterLevel?: WaterLevel
    lat?: number
    lng?: number
    photoUrl?: string | null
    verifiedAt?: Date | null
    verifiedById?: string | null
  } = {}
  // Moving a report between areas has to move the row too, or it keeps
  // appearing under the old city's pins.
  let previousLguSlug: string | null = null
  if (content.lguSlug !== undefined && content.lguSlug !== existing.lgu.slug) {
    const lgu = await getLguBySlug(content.lguSlug)
    if (!lgu) return notFound("Unknown area")
    data.lguId = lgu.id
    previousLguSlug = existing.lgu.slug
  }
  if (content.locationName !== undefined)
    data.locationName = content.locationName
  if (content.description !== undefined)
    data.description = content.description || null
  if (content.waterLevel !== undefined) data.waterLevel = content.waterLevel
  if (content.lat !== undefined) data.lat = content.lat
  if (content.lng !== undefined) data.lng = content.lng
  if (content.photoUrl !== undefined) data.photoUrl = content.photoUrl || null
  if (verified !== undefined) {
    data.verifiedAt = verified ? new Date() : null
    data.verifiedById = verified ? auth.user.id : null
  } else if (editsContent && !isOfficial) {
    // A resident editing a verified report would otherwise keep the DRRM
    // office's badge over content the office never saw. The badge has to be
    // re-earned.
    data.verifiedAt = null
    data.verifiedById = null
  }

  const updated = await prisma.floodReport.update({
    where: { id },
    data,
    include: {
      lgu: { select: { slug: true, name: true } },
      author: { select: { fullName: true, organisation: true } },
    },
  })

  const report = await getReport(id, auth.user.id)
  if (!report) return notFound("Report not found")

  // A move belongs to both areas, so both are dropped from the cache.
  revalidateReports(updated.lgu.slug, previousLguSlug)
  broadcast("report:updated", toPublicReport(updated), updated.lgu.slug)
  // A move has to clear the pin from the area it left, not just add it to the
  // one it joined.
  if (previousLguSlug) {
    broadcast(
      "report:deleted",
      { id, lguSlug: previousLguSlug },
      previousLguSlug
    )
  }

  return json({ report })
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const { id } = await params

  const auth = await requireUser()
  if (auth.response) return auth.response

  const existing = await loadOwnership(id)
  if (!existing) return notFound("Report not found")
  if (existing.authorId !== auth.user.id && auth.user.role !== "OFFICIAL") {
    return forbidden()
  }

  // Soft delete: the map drops it, the audit trail keeps it.
  await prisma.floodReport.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  revalidateReports(existing.lgu.slug)
  broadcast(
    "report:deleted",
    { id, lguSlug: existing.lgu.slug },
    existing.lgu.slug
  )

  return json({ ok: true })
}
