import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { ManageReportsView } from "@/components/reports/manage-reports-view"
import { getSessionUser } from "@/lib/auth/session"
import { MANAGE_PAGE_SIZE } from "@/lib/domain"
import { en } from "@/lib/i18n/dictionary"
import { listAllReports, listLgus } from "@/lib/server/queries"

export const metadata: Metadata = { title: en.manage.title }

/**
 * Every report in the province, for the DRRM office alone.
 *
 * A screen of its own rather than a fourth tab on /admin: the panel's tabs all
 * stay mounted so a half-typed broadcast survives a detour, and a paged list of
 * every report the province has ever filed is not something to keep mounted
 * behind an evacuation order being written.
 *
 * The first page is rendered on the server so an officer opening the console
 * during a flood sees reports rather than a spinner; the filters from there on
 * are the client component's.
 */
export default async function ManageReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ lgu?: string | string[] }>
}) {
  const user = await getSessionUser()
  if (!user) redirect("/signin?next=/reports")
  // Residents are sent back to the map rather than shown a locked screen —
  // the same choice /admin makes.
  if (user.role !== "OFFICIAL") redirect("/dashboard")

  const { lgu } = await searchParams
  const requested = Array.isArray(lgu) ? lgu[0] : lgu

  const lgus = await listLgus()
  // The shell threads the viewer's chosen area through every nav link, so the
  // console opens on that area rather than ignoring the choice they just made.
  const scope = lgus.some((area) => area.slug === requested)
    ? (requested ?? null)
    : null

  const page = await listAllReports(
    { lguSlug: scope, limit: MANAGE_PAGE_SIZE },
    user.id
  )

  return (
    <ManageReportsView
      lgus={lgus}
      initialScope={scope}
      initialReports={page.reports}
      initialTotal={page.total}
      generatedAt={new Date().toISOString()}
    />
  )
}
