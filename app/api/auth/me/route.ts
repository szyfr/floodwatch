import type { NextRequest, NextResponse } from "next/server"

import { json, readBody, requireUser } from "@/lib/api"
import { getSessionUser, toSessionUser } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import type { ApiError, SessionUserDto } from "@/lib/dto"
import { languageSchema } from "@/lib/validation"

/** Always 200 — the client calls this on boot to rehydrate, signed in or not. */
export async function GET(): Promise<
  NextResponse<{ user: SessionUserDto | null }>
> {
  return json({ user: await getSessionUser() })
}

export async function PATCH(
  request: NextRequest
): Promise<NextResponse<{ user: SessionUserDto } | ApiError>> {
  const session = await requireUser()
  if (session.response) return session.response

  const { data, response } = await readBody(request, languageSchema)
  if (response) return response

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { language: data.language },
    include: { lgu: { select: { slug: true, name: true } } },
  })
  return json({ user: toSessionUser(user) })
}
