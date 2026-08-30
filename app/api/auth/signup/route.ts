import type { NextRequest, NextResponse } from "next/server"

import { Prisma } from "@/generated/prisma/client"
import { apiError, json, readBody } from "@/lib/api"
import { hashPassword } from "@/lib/auth/password"
import { startSession, toSessionUser } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import type { ApiError, SessionUserDto } from "@/lib/dto"
import { signUpSchema } from "@/lib/validation"

const emailTaken = (): NextResponse<ApiError> =>
  apiError("An account already exists for that email", 409, {
    code: "EMAIL_TAKEN",
    fields: { email: "errTaken" },
  })

export async function POST(
  request: NextRequest
): Promise<NextResponse<{ user: SessionUserDto } | ApiError>> {
  const { data, response } = await readBody(request, signUpSchema)
  if (response) return response

  const lgu = await prisma.lgu.findUnique({
    where: { slug: data.lguSlug },
    select: { id: true },
  })
  // The form picks from /api/lgus, so this only fires on a stale or hand-made
  // payload - but the select still deserves a field-level error.
  if (!lgu) {
    return apiError("Choose a city or municipality from the list", 422, {
      code: "INVALID",
      fields: { lguSlug: "errLgu" },
    })
  }

  const taken = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  })
  if (taken) return emailTaken()

  const passwordHash = await hashPassword(data.password)

  const user = await prisma.user
    .create({
      data: {
        email: data.email,
        passwordHash,
        fullName: data.fullName,
        role: "RESIDENT",
        lguId: lgu.id,
      },
      include: { lgu: { select: { slug: true, name: true } } },
    })
    // Two signups for the same email can pass the check above concurrently.
    .catch((error: unknown) => {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return null
      }
      throw error
    })
  if (!user) return emailTaken()

  await startSession({ id: user.id, email: user.email, role: "RESIDENT" })
  return json({ user: toSessionUser(user) }, { status: 201 })
}
