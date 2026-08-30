import type { Metadata } from "next"

import { AlertsView } from "@/components/alerts/alerts-view"
import { getSessionUser } from "@/lib/auth/session"
import { en } from "@/lib/i18n/dictionary"
import { getLguBySlug, listAlerts } from "@/lib/server/queries"

export const metadata: Metadata = { title: en.alerts.title }

/**
 * The alert list follows the same `?lgu=` scope as the dashboard, so a link to
 * one area's alerts is shareable. Readable without a session.
 */
export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ lgu?: string | string[] }>
}) {
  const params = await searchParams
  const raw = Array.isArray(params.lgu) ? params.lgu[0] : params.lgu
  // An unknown slug would narrow the query to province-wide alerts only and
  // silently hide every area-targeted one, so it falls back to no scope.
  const scoped = raw ? await getLguBySlug(raw) : null
  const lgu = scoped?.slug ?? null

  const user = await getSessionUser()
  const alerts = await listAlerts(user?.id ?? null, lgu)

  return <AlertsView alerts={alerts} scopeSlug={lgu} signedIn={Boolean(user)} />
}
