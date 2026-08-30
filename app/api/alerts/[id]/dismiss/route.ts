import { json, notFound, requireUser } from "@/lib/api"
import { prisma } from "@/lib/db"

type Context = { params: Promise<{ id: string }> }

/**
 * Dismissing is personal — one resident clearing a banner must not clear it for
 * the province — so nothing is broadcast and the row is keyed (alert, user).
 */
export async function POST(_request: Request, { params }: Context) {
  const auth = await requireUser()
  if (auth.response) return auth.response

  const { id } = await params
  const alert = await prisma.alert.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!alert) return notFound("Alert not found")

  await prisma.alertDismissal.upsert({
    where: { alertId_userId: { alertId: id, userId: auth.user.id } },
    create: { alertId: id, userId: auth.user.id },
    update: {},
  })
  return json({ ok: true })
}

/** Undo. deleteMany rather than delete so a second undo is still a 200. */
export async function DELETE(_request: Request, { params }: Context) {
  const auth = await requireUser()
  if (auth.response) return auth.response

  const { id } = await params
  await prisma.alertDismissal.deleteMany({
    where: { alertId: id, userId: auth.user.id },
  })
  return json({ ok: true })
}
