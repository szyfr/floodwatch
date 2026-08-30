import type { NextRequest, NextResponse } from "next/server"

import { apiError, json, readBody } from "@/lib/api"
import { decoyHash, verifyPassword } from "@/lib/auth/password"
import { startSession, toSessionUser } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import type { ApiError, SessionUserDto } from "@/lib/dto"
import { signInSchema } from "@/lib/validation"

const badCredentials = (): NextResponse<ApiError> =>
  apiError("That email and password do not match an account", 401, {
    code: "BAD_CREDENTIALS",
    fields: { password: "errCreds" },
  })

export async function POST(
  request: NextRequest
): Promise<NextResponse<{ user: SessionUserDto } | ApiError>> {
  const { data, response } = await readBody(request, signInSchema)
  if (response) return response

  const user = await prisma.user.findUnique({
    where: { email: data.email },
    include: { lgu: { select: { slug: true, name: true } } },
  })

  // An unknown email and a wrong password must be indistinguishable, so a miss
  // still costs one bcrypt compare and returns the same 401 body.
  const matches = await verifyPassword(
    data.password,
    user?.passwordHash ?? (await decoyHash())
  )
  if (!user || !matches) return badCredentials()

  await startSession({
    id: user.id,
    email: user.email,
    role: user.role === "OFFICIAL" ? "OFFICIAL" : "RESIDENT",
  })
  return json({ user: toSessionUser(user) })
}
