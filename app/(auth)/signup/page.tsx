import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AuthForm } from "@/components/auth/auth-form"
import { getSessionUser } from "@/lib/auth/session"
import { en } from "@/lib/i18n/dictionary"
import { listLgus } from "@/lib/server/queries"

export const metadata: Metadata = { title: en.auth.upTitle }

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [user, params, lgus] = await Promise.all([
    getSessionUser(),
    searchParams,
    listLgus(),
  ])
  if (user) redirect("/dashboard")

  const next = params.next
  return (
    <AuthForm
      mode="signup"
      lgus={lgus}
      next={typeof next === "string" ? next : null}
    />
  )
}
