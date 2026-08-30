import { apiError, json, notFound, readBody, requireOfficial } from "@/lib/api"
import { prisma } from "@/lib/db"
import { broadcast } from "@/lib/realtime/emit"
import { revalidateZones } from "@/lib/server/cache"
import { toZone } from "@/lib/serialize"
import { updateZoneSchema } from "@/lib/validation"

type Context = { params: Promise<{ id: string }> }

const withLgu = { lgu: { select: { slug: true, name: true } } } as const

export async function PATCH(request: Request, { params }: Context) {
  const auth = await requireOfficial()
  if (auth.response) return auth.response

  const { id } = await params
  const body = await readBody(request.clone(), updateZoneSchema)
  if (body.response) return body.response
  const { lguSlug, ...input } = body.data

  // updateZoneSchema is createZoneSchema.partial(), which keeps that schema's
  // `occupancy: 0` default - so a parsed patch always carries an occupancy even
  // when the editor never touched it. The dialog has no occupancy field at all,
  // so trusting the parsed value would empty every centre it saves. Only the
  // keys actually sent get written.
  const sent = new Set(
    Object.keys((await request.json()) as Record<string, unknown>)
  )
  if (sent.size === 0) {
    return apiError("Nothing to update", 422, {
      code: "INVALID",
      fields: { form: "generic" },
    })
  }

  const existing = await prisma.safeZone.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, lgu: { select: { slug: true } } },
  })
  if (!existing) return notFound("Safe zone not found")

  // Moving a centre between areas has to clear it from the one it left, or it
  // keeps appearing on that area's map and in its cached list. The dialog sends
  // lguSlug on every save, so only an actual change counts as a move.
  let previousLguSlug: string | null = null
  let lguId: string | undefined
  if (lguSlug) {
    if (lguSlug !== existing.lgu.slug) previousLguSlug = existing.lgu.slug
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
    lguId = lgu.id
  }

  // Prisma reads `undefined` as "leave alone"; only capacity and the contacts
  // can be cleared, and only with an explicit null.
  const row = await prisma.safeZone.update({
    where: { id },
    data: {
      ...input,
      occupancy: sent.has("occupancy") ? input.occupancy : undefined,
      lguId,
    },
    include: withLgu,
  })

  const zone = toZone(row)
  // Both areas: the one it joined and, on a move, the one it left.
  revalidateZones(zone.lguSlug, previousLguSlug)
  broadcast("zone:updated", zone, zone.lguSlug)
  return json({ zone })
}

export async function DELETE(_request: Request, { params }: Context) {
  const auth = await requireOfficial()
  if (auth.response) return auth.response

  const { id } = await params
  const existing = await prisma.safeZone.findFirst({
    where: { id, deletedAt: null },
    include: withLgu,
  })
  if (!existing) return notFound("Safe zone not found")

  // Soft delete: the resident map drops it, the audit trail keeps it.
  await prisma.safeZone.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  revalidateZones(existing.lgu.slug)
  broadcast(
    "zone:deleted",
    { id, lguSlug: existing.lgu.slug },
    existing.lgu.slug
  )
  return json({ ok: true })
}
