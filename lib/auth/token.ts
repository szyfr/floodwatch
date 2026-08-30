/**
 * Session tokens. A short JWT in an httpOnly cookie — no session table, so the
 * socket handshake can verify the same cookie without a database round-trip.
 */
import { SignJWT, jwtVerify } from "jose"

import type { Role } from "@/lib/dto"

export const SESSION_COOKIE = "fw_session"
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export type SessionClaims = {
  sub: string
  email: string
  role: Role
}

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET
  if (!value) {
    throw new Error("AUTH_SECRET is not set — copy .env.example to .env")
  }
  return new TextEncoder().encode(value)
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ email: claims.email, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret())
}

export async function verifySession(
  token: string
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"],
    })
    if (!payload.sub) return null
    return {
      sub: payload.sub,
      email: String(payload.email ?? ""),
      role: (payload.role === "OFFICIAL" ? "OFFICIAL" : "RESIDENT") as Role,
    }
  } catch {
    return null
  }
}

/** Pull the session cookie out of a raw `Cookie:` header (socket handshake). */
export function readSessionCookie(
  cookieHeader: string | undefined
): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=")
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="))
  }
  return null
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_MAX_AGE,
  secure: process.env.NODE_ENV === "production",
} as const
