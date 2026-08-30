import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AuthForm } from "@/components/auth/auth-form"
import { getSessionUser } from "@/lib/auth/session"
import { en } from "@/lib/i18n/dictionary"

export const metadata: Metadata = { title: en.auth.inTitle }

/** `?next` is attacker-controllable, so only a same-origin path survives. */
function safePath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) return null
  if (value.startsWith("//") || value.startsWith("/\\")) return null
  return value
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [user, params] = await Promise.all([getSessionUser(), searchParams])
  const next = safePath(params.next)
  // Someone who signs in elsewhere and comes back should still land where they
  // were headed.
  if (user) redirect(next ?? "/dashboard")

  return <AuthForm mode="signin" next={next} />
}
