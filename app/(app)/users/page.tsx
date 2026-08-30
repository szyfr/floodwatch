import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { ManageUsersView } from "@/components/users/manage-users-view"
import { getSessionUser } from "@/lib/auth/session"
import { MANAGE_PAGE_SIZE } from "@/lib/domain"
import { en } from "@/lib/i18n/dictionary"
import { listLgus, listUsers } from "@/lib/server/queries"

export const metadata: Metadata = { title: en.users.title }

/**
 * Every account in the province, for the DRRM office alone.
 *
 * A screen of its own for the report console's reason — the panel's tabs stay
 * mounted, and a paged list of every resident is not something to keep mounted
 * behind a half-written evacuation order — and because the two consoles are
 * genuinely different jobs: one works a backlog of sightings, this one answers
 * "who is this person and what can they do".
 *
 * The first page is rendered on the server so the list is there on arrival;
 * every filter from then on is the client component's.
 */
export default async function ManageUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ lgu?: string | string[] }>
}) {
  const user = await getSessionUser()
  if (!user) redirect("/signin?next=/users")
  // Residents are sent back to the map rather than shown a locked screen —
  // the same choice /admin and /reports make.
  if (user.role !== "OFFICIAL") redirect("/dashboard")

  const { lgu } = await searchParams
  const requested = Array.isArray(lgu) ? lgu[0] : lgu

  const lgus = await listLgus()
  // The shell threads the viewer's chosen area through every nav link, so the
  // console opens on that area rather than ignoring the choice they just made.
  const scope = lgus.some((area) => area.slug === requested)
    ? (requested ?? null)
    : null

  const page = await listUsers(
    { lguSlug: scope, limit: MANAGE_PAGE_SIZE },
    user.id
  )

  return (
    <ManageUsersView
      lgus={lgus}
      initialScope={scope}
      initialUsers={page.users}
      initialTotal={page.total}
    />
  )
}
