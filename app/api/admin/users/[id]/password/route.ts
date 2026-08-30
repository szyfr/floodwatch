import type { NextRequest } from "next/server"

import { json, notFound, readBody, requireOfficial } from "@/lib/api"
import { hashPassword } from "@/lib/auth/password"
import { prisma } from "@/lib/db"
import { resetPasswordSchema } from "@/lib/validation"

type Context = { params: Promise<{ id: string }> }

/**
 * An officer setting someone else's password - what the sign-in screen means
 * by "ask the app admin to reset it for you".
 *
 * PUT rather than PATCH: a password is replaced whole, and there is nothing
 * here to merge with what was there before.
 *
 * The account's existing sessions are not ended by this. Sessions are signed
 * JWTs with no server-side record to revoke, so a reset changes what the next
 * sign-in needs and nothing else; ending them would need a counter on the row
 * for the token to be checked against.
 */
export async function PUT(request: NextRequest, { params }: Context) {
  const { id } = await params

  const auth = await requireOfficial()
  if (auth.response) return auth.response

  const body = await readBody(request, resetPasswordSchema)
  if (body.response) return body.response

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!existing) return notFound("Account not found")

  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(body.data.password) },
  })

  return json({ ok: true })
}
