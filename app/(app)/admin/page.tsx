import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AdminView } from "@/components/admin/admin-view"
import type { AdminTab } from "@/components/admin/admin-view"
import { getSessionUser } from "@/lib/auth/session"
import { en } from "@/lib/i18n/dictionary"
import { listLgus, listZones } from "@/lib/server/queries"

export const metadata: Metadata = { title: en.admin.title }

// A Record rather than an array so TypeScript rejects a tab added to the union
// and forgotten here — the list itself lives in the client component, which the
// server cannot import a value from.
const TABS: Record<AdminTab, true> = {
  broadcast: true,
  zones: true,
  routes: true,
}

/**
 * The operations desk. Officials only — residents are sent back to the map
 * rather than shown a locked screen.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; lgu?: string }>
}) {
  const user = await getSessionUser()
  if (!user) redirect("/signin?next=/admin")
  if (user.role !== "OFFICIAL") redirect("/dashboard")

  const { tab, lgu } = await searchParams
  const [lgus, zones] = await Promise.all([listLgus(), listZones()])

  // The panel is province-wide, so a new safe zone needs a starting area: the
  // one the viewer has scoped to, or their own office's.
  const scoped = lgus.some((area) => area.slug === lgu) ? lgu : undefined

  return (
    <AdminView
      tab={tab && Object.hasOwn(TABS, tab) ? (tab as AdminTab) : "broadcast"}
      lgus={lgus}
      zones={zones}
      scopeSlug={scoped ?? user.lguSlug}
    />
  )
}
