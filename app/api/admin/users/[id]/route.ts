import type { NextRequest } from "next/server"

import { apiError, json, notFound, readBody, requireOfficial } from "@/lib/api"
import { prisma } from "@/lib/db"
import { revalidateReports } from "@/lib/server/cache"
import { getLguBySlug } from "@/lib/server/queries"
import { toManagedUser } from "@/lib/serialize"
import { updateUserSchema } from "@/lib/validation"

type Context = { params: Promise<{ id: string }> }

const userInclude = {
  lgu: { select: { slug: true, name: true } },
  _count: { select: { reports: { where: { deletedAt: null } } } },
} as const

export async function PATCH(request: NextRequest, { params }: Context) {
  const { id } = await params

  const auth = await requireOfficial()
  if (auth.response) return auth.response

  const body = await readBody(request, updateUserSchema)
  if (body.response) return body.response

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, fullName: true, organisation: true },
  })
  if (!existing) return notFound("Account not found")

  // An officer cannot take their own OFFICIAL role away. The point is not to
  // protect them from a misclick: it is that the province can then never be
  // left with nobody who can broadcast an evacuation order, because the last
  // official standing is always someone no other official can demote.
  if (body.data.role !== undefined && existing.id === auth.user.id) {
    return apiError("You cannot change your own role", 409, {
      code: "SELF_ROLE",
      fields: { role: "errSelfRole" },
    })
  }

  const data: {
    fullName?: string
    role?: "RESIDENT" | "OFFICIAL"
    organisation?: string | null
    lguId?: string
  } = {}
  if (body.data.fullName !== undefined) data.fullName = body.data.fullName
  if (body.data.role !== undefined) data.role = body.data.role
  if (body.data.organisation !== undefined) {
    data.organisation = body.data.organisation || null
  }
  if (body.data.lguSlug !== undefined) {
    const lgu = await getLguBySlug(body.data.lguSlug)
    if (!lgu) return notFound("Unknown area")
    data.lguId = lgu.id
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    include: userInclude,
  })

  // Reports carry their author's name, and those lists are cached. A rename is
  // rare and the entries are short-lived, so the whole report tier is dropped
  // rather than hunting down which areas this person has filed in.
  if (
    (data.fullName !== undefined && data.fullName !== existing.fullName) ||
    (data.organisation !== undefined &&
      data.organisation !== existing.organisation)
  ) {
    revalidateReports()
  }

  return json({ user: toManagedUser(updated, auth.user.id) })
}
