import "server-only"

import { cache } from "react"
import { cookies } from "next/headers"

import { prisma } from "@/lib/db"
import type { SessionUserDto } from "@/lib/dto"
import { initialsFor, type Language } from "@/lib/domain"
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
  verifySession,
} from "@/lib/auth/token"

/**
 * The signed-in user, or null. Reads the httpOnly cookie, verifies the JWT and
 * loads the row so a deleted or demoted account loses access immediately.
 *
 * Wrapped in React's cache() because a single navigation asks for the viewer
 * three times over — the root layout, the app layout and the page itself — and
 * each ask was previously its own JWT verify and its own user query. The memo
 * lives on React's per-request dispatcher, so it cannot outlive the request:
 * with no dispatcher (a route handler, a script) cache() falls through to the
 * raw function rather than storing anything. One viewer's session can never be
 * served to another.
 */
export const getSessionUser = cache(
  async function getSessionUser(): Promise<SessionUserDto | null> {
    const store = await cookies()
    const token = store.get(SESSION_COOKIE)?.value
    if (!token) return null

    const claims = await verifySession(token)
    if (!claims) return null

    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      include: { lgu: { select: { slug: true, name: true } } },
    })
    if (!user) return null

    return toSessionUser(user)
  }
)

type UserWithLgu = {
  id: string
  email: string
  fullName: string
  role: string
  organisation: string | null
  language: string
  lgu: { slug: string; name: string }
}

export function toSessionUser(user: UserWithLgu): SessionUserDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    initials: initialsFor(user.fullName),
    role: user.role === "OFFICIAL" ? "OFFICIAL" : "RESIDENT",
    organisation: user.organisation,
    language: (user.language === "tl" ? "tl" : "en") as Language,
    lguSlug: user.lgu.slug,
    lguName: user.lgu.name,
  }
}

/** Route handlers and server actions only — cookies cannot be set while rendering. */
export async function startSession(user: {
  id: string
  email: string
  role: "RESIDENT" | "OFFICIAL"
}): Promise<void> {
  const token = await signSession({
    sub: user.id,
    email: user.email,
    role: user.role,
  })
  const store = await cookies()
  store.set(SESSION_COOKIE, token, sessionCookieOptions)
}

export async function endSession(): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 })
}
