import type { Metadata } from "next"

import { DashboardView } from "@/components/dashboard/dashboard-view"
import { getSessionUser } from "@/lib/auth/session"
import { en } from "@/lib/i18n/dictionary"
import {
  DEFAULT_RECENCY,
  RECENCY_OPTIONS,
  SORT_OPTIONS,
  WATER_LEVELS,
  type Recency,
  type SortOption,
} from "@/lib/domain"
import { getDashboard, getLguBySlug, getReport } from "@/lib/server/queries"

export const metadata: Metadata = { title: en.nav.map }

type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null
}

/**
 * Scope, filters and the open report all live in the URL so a link is
 * shareable. Values that are not in the enums are dropped rather than refused -
 * they arrive from stale links and hand-edited addresses.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const viewer = await getSessionUser()

  const levelParam = first(params.level)
  const level = WATER_LEVELS.find((option) => option === levelParam) ?? null
  const recencyParam = first(params.recency)
  const recency: Recency =
    RECENCY_OPTIONS.find((option) => option === recencyParam) ?? DEFAULT_RECENCY
  const sortParam = first(params.sort)
  const sort: SortOption =
    SORT_OPTIONS.find((option) => option === sortParam) ?? "recent"

  const lguParam = first(params.lgu)
  const lgu = lguParam ? await getLguBySlug(lguParam) : null
  const scope = lgu?.slug ?? null

  const reportId = first(params.report)
  const viewerId = viewer?.id ?? null

  const [data, linked] = await Promise.all([
    getDashboard({ lguSlug: scope, level, recency, sort }, viewerId),
    // Fetched separately so a linked report still opens when the active
    // filters would have excluded it from the list.
    reportId ? getReport(reportId, viewerId) : Promise.resolve(null),
  ])

  return (
    <DashboardView
      data={data}
      scope={scope}
      level={level}
      recency={recency}
      sort={sort}
      reportId={linked?.id ?? null}
      linkedReport={linked}
    />
  )
}
