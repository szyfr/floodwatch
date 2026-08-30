import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { SubmitForm } from "@/components/submit/submit-form"
import { getSessionUser } from "@/lib/auth/session"
import { geocodeEnabled } from "@/lib/server/geocode"
import { en } from "@/lib/i18n/dictionary"
import { getReport, listLgus } from "@/lib/server/queries"

export const metadata: Metadata = { title: en.submit.title }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

export default async function SubmitPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const [user, params] = await Promise.all([getSessionUser(), searchParams])

  if (!user) {
    // Keep the deep link - someone following an edit link should land back on
    // that report, not on a blank form.
    const query = new URLSearchParams()
    for (const key of ["edit", "lgu"]) {
      const value = first(params[key])
      if (value) query.set(key, value)
    }
    const target = query.size ? `/submit?${query}` : "/submit"
    redirect(`/signin?next=${encodeURIComponent(target)}`)
  }

  const editId = first(params.edit)

  const [lgus, report] = await Promise.all([
    listLgus(),
    editId ? getReport(editId, user.id) : null,
  ])

  if (editId && !report) notFound()
  // Content is the author's to change; the DRRM office edits through the panel.
  if (report && !report.isOwner) redirect("/dashboard")

  return (
    <SubmitForm
      lgus={lgus}
      report={report}
      presetLguSlug={first(params.lgu)}
      defaultLguSlug={user.lguSlug}
      placeSearch={geocodeEnabled}
    />
  )
}
