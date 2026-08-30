import type { NextRequest } from "next/server"

import { apiError, json, readBody, requireUser } from "@/lib/api"
import { hashPassword, verifyPassword } from "@/lib/auth/password"
import { prisma } from "@/lib/db"
import { changePasswordSchema } from "@/lib/validation"

/**
 * Changing your own password. Every signed-in account, resident or official.
 *
 * The current password is verified even though the caller is already signed in:
 * the session cookie proves the browser was left signed in, which is exactly
 * the situation this guards against — a shared or borrowed phone must not be
 * enough to lock the owner out of their own account.
 */
export async function PUT(request: NextRequest) {
  const auth = await requireUser()
  if (auth.response) return auth.response

  const body = await readBody(request, changePasswordSchema)
  if (body.response) return body.response

  const row = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { passwordHash: true },
  })
  // The session survives a deleted account only until the next read; this is
  // that read.
  if (!row)
    return apiError("Sign in to continue", 401, { code: "UNAUTHORIZED" })

  const ok = await verifyPassword(body.data.currentPassword, row.passwordHash)
  if (!ok) {
    return apiError("That password is not right", 422, {
      code: "BAD_PASSWORD",
      fields: { currentPassword: "errCurrent" },
    })
  }

  await prisma.user.update({
    where: { id: auth.user.id },
    data: { passwordHash: await hashPassword(body.data.password) },
  })

  return json({ ok: true })
}
