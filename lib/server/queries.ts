import "server-only"

import { unstable_cache } from "next/cache"

import { prisma } from "@/lib/db"
import type {
  AlertDto,
  DashboardDto,
  GaugeDto,
  LguDto,
  LguSummaryDto,
  ManageReportsDto,
  ManageUsersDto,
  PublicReportDto,
  ReportDto,
  VoteValue,
  ZoneDto,
} from "@/lib/dto"
import {
  DEFAULT_RECENCY,
  DEFAULT_RECENCY_MINUTES,
  MANAGE_PAGE_SIZE,
  type Recency,
  type ReportOrder,
  type ReportStatus,
  type SortOption,
  type UserOrder,
  type UserRoleFilter,
  type WaterLevel,
} from "@/lib/domain"
import { tags } from "@/lib/server/cache"
import {
  sortReports,
  summariseEvacuation,
  summariseLgus,
  toAlert,
  toGauge,
  toLgu,
  toManagedUser,
  toPublicReport,
  toReport,
  toZone,
  withReportFreshness,
} from "@/lib/serialize"

/**
 * Server-side caching for the read path.
 *
 * Two rules shape everything below, and breaking either one is a silent
 * correctness bug rather than a slow page:
 *
 * 1. Only viewer-independent data is cached. Whether *you* voted on a report or
 *    dismissed an alert is fetched per request and merged on top, so a shared
 *    entry can never carry one resident's state to another.
 *
 * 2. Only JSON-safe values cross the boundary. unstable_cache stringifies what
 *    it stores and parses what it serves, so a Date goes in and a string comes
 *    out — but only on a hit; a miss returns the live object. Returning a
 *    Prisma row would therefore work on the first request and throw on the
 *    second. Everything cached here is already a DTO with ISO strings.
 */

/** How long each tier may serve a read before refreshing on its own. */
const TTL = {
  /** Safety-critical and cheap to rebuild; tag invalidation does the real work. */
  reports: 15,
  alerts: 15,
  gauges: 120,
  zones: 300,
  /** Effectively reference data — nothing in the running app writes an LGU. */
  lgus: 60 * 60 * 24,
} as const

/**
 * Cache keys have to hold still. Every report and alert query is bounded by a
 * "now", and threading Date.now() straight through would mint a fresh key every
 * millisecond — a cache that never hits once. The caller rounds now down to a
 * bucket instead, so every request inside the same bucket shares one entry.
 *
 * Rounding *down* is the safe direction in both places it is used. The report
 * window's lower bound only ever moves earlier, so a bucket can keep a report
 * that just aged out but can never hide one that just arrived. Alert expiry can
 * likewise only run late, which for an evacuation order is the side to err on.
 */
const BUCKET_MS = 15_000

function nowBucket(): number {
  return Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS
}

/**
 * Builds one cached reader per scope.
 *
 * unstable_cache fixes its tags when the wrapper is built rather than when it
 * is called, so a single wrapper cannot tag San Fernando's entry differently
 * from Candaba's. Each scope therefore gets its own wrapper, memoised here. The
 * province has twenty-two areas plus the unscoped case, so the map is small and
 * bounded by the data rather than by traffic.
 */
function perScope<A extends unknown[], R>(
  name: string,
  load: (scope: string | null, ...args: A) => Promise<R>,
  tagsFor: (scope: string | null) => string[],
  revalidate: number
): (scope: string | null, ...args: A) => Promise<R> {
  const wrappers = new Map<string, (...args: A) => Promise<R>>()
  return (scope, ...args) => {
    const key = scope ?? "*"
    let wrapped = wrappers.get(key)
    if (!wrapped) {
      wrapped = unstable_cache(
        (...inner: A) => load(scope, ...inner),
        [name, key],
        { revalidate, tags: tagsFor(scope) }
      )
      wrappers.set(key, wrapped)
    }
    return wrapped(...args)
  }
}

const reportTags = (scope: string | null) =>
  scope ? [tags.reportsIn(scope)] : [tags.reports]

/**
 * No `votes` include any more. It used to drag every vote on every report down
 * so the serialiser could pick the viewer's one out of the array; that is both
 * the per-viewer data a shared cache must not hold and, on a busy report, far
 * more rows than the answer needs.
 */
const reportInclude = {
  lgu: { select: { slug: true, name: true } },
  author: { select: { fullName: true, organisation: true } },
} as const

function since(recency: Recency, at: number): number | null {
  if (recency === "all") return null
  return at - Number(recency) * 60_000
}

// ------------------------------------------------------------------ areas

const cachedLgus = unstable_cache(
  async (): Promise<LguDto[]> => {
    const rows = await prisma.lgu.findMany({ orderBy: { name: "asc" } })
    return rows.map(toLgu)
  },
  ["lgu-list"],
  { revalidate: TTL.lgus, tags: [tags.lgus] }
)

export async function listLgus(): Promise<LguDto[]> {
  return cachedLgus()
}

/**
 * The twenty-two areas are a fixed list, so a slug lookup is a find over the
 * cached one rather than its own round-trip. It also returns a DTO instead of
 * the raw row it used to: the row carried createdAt/updatedAt Dates, which is
 * exactly the shape that must not cross a cache boundary. Every caller only
 * ever read `id` and `slug`.
 */
export async function getLguBySlug(slug: string): Promise<LguDto | null> {
  const lgus = await cachedLgus()
  return lgus.find((lgu) => lgu.slug === slug) ?? null
}

/**
 * Every area with what it is reporting right now — the area picker, and the
 * refetch the dashboard makes after a removal to get the province's counts
 * straight. Shares the dashboard's cached rollup and is dropped by the same
 * report writes.
 *
 * The window is fixed at the default one, matching what this endpoint has
 * always returned. The dashboard rolls up over whatever recency the viewer has
 * chosen instead, so on a non-default filter the two land on different entries
 * and report different counts — a pre-existing disagreement between the two
 * surfaces that is preserved here rather than introduced.
 */
export async function listLguSummaries(): Promise<LguSummaryDto[]> {
  const [lgus, rollup] = await Promise.all([
    cachedLgus(),
    cachedRollup(nowBucket() - DEFAULT_RECENCY_MINUTES * 60_000),
  ])
  return summariseLgus(lgus, rollup)
}

/**
 * Resolves a requested scope against the real areas.
 *
 * This is a safety valve, not a nicety. perScope memoises one wrapper per scope
 * string for the life of the process, and the JSON API takes `?lgu=` on trust
 * after a shape check alone — so an unauthenticated caller varying the slug
 * could otherwise mint wrappers, and on-disk cache entries Next never prunes,
 * without bound. Resolving here closes the key space to the twenty-two areas
 * plus the unscoped case, which is what perScope's comment assumes.
 *
 * The pages already resolved the slug themselves before calling in; this puts
 * the same guarantee under the API routes, which did not.
 */
async function knownScope(
  lguSlug: string | null | undefined
): Promise<{ ok: boolean; scope: string | null }> {
  const slug = lguSlug ?? null
  if (!slug) return { ok: true, scope: null }
  const lgus = await cachedLgus()
  if (lgus.some((lgu) => lgu.slug === slug)) return { ok: true, scope: slug }
  // An area that does not exist matches nothing, so the answer is known
  // without asking the database or the cache for it.
  return { ok: false, scope: null }
}

// ---------------------------------------------------------------- reports

const cachedPublicReports = perScope(
  "public-reports",
  async (
    scope,
    level: WaterLevel | null,
    createdAfter: number | null,
    limit: number
  ): Promise<PublicReportDto[]> => {
    const rows = await prisma.floodReport.findMany({
      where: {
        deletedAt: null,
        ...(scope ? { lgu: { slug: scope } } : {}),
        ...(level ? { waterLevel: level } : {}),
        ...(createdAfter ? { createdAt: { gte: new Date(createdAfter) } } : {}),
      },
      include: reportInclude,
      orderBy: { createdAt: "desc" },
      take: limit,
    })
    return rows.map(toPublicReport)
  },
  reportTags,
  TTL.reports
)

const cachedScopeCount = perScope(
  "report-scope-count",
  async (scope, createdAfter: number | null): Promise<number> =>
    prisma.floodReport.count({
      where: {
        deletedAt: null,
        ...(scope ? { lgu: { slug: scope } } : {}),
        ...(createdAfter ? { createdAt: { gte: new Date(createdAfter) } } : {}),
      },
    }),
  reportTags,
  TTL.reports
)

/**
 * The province rollup behind the map bubbles and the area sheet. Always
 * province-wide and always ignoring the level filter, so that every area which
 * is reporting anything keeps its bubble; cached once and shared by every
 * scope's dashboard rather than recomputed per area.
 */
const cachedRollup = unstable_cache(
  async (createdAfter: number | null) => {
    const rows = await prisma.floodReport.findMany({
      where: {
        deletedAt: null,
        ...(createdAfter ? { createdAt: { gte: new Date(createdAfter) } } : {}),
      },
      select: { lguId: true, waterLevel: true, createdAt: true },
    })
    // Dates would come back as strings on a hit and stay Dates on a miss, so
    // they are flattened here and the difference never reaches the caller.
    return rows.map((row) => ({
      lguId: row.lguId,
      waterLevel: row.waterLevel as string,
      createdAt: row.createdAt.toISOString(),
    }))
  },
  ["report-rollup"],
  { revalidate: TTL.reports, tags: [tags.reportsRollup] }
)

export type ReportFilters = {
  lguSlug?: string | null
  level?: WaterLevel | null
  recency?: Recency
  sort?: SortOption
  limit?: number
}

/**
 * The viewer's own votes for one page of reports, in a single indexed lookup —
 * ReportVote is unique on (reportId, userId). Signed-out viewers skip it.
 */
async function viewerVotes(
  reportIds: string[],
  viewerId: string | null
): Promise<Map<string, VoteValue>> {
  if (!viewerId || reportIds.length === 0) return new Map()
  const rows = await prisma.reportVote.findMany({
    where: { userId: viewerId, reportId: { in: reportIds } },
    select: { reportId: true, value: true },
  })
  return new Map(rows.map((row) => [row.reportId, row.value as VoteValue]))
}

/** Puts the viewer back on top of a shared, cached list. */
async function decorateReports(
  reports: PublicReportDto[],
  viewerId: string | null,
  /** null keeps the order the caller already put the rows in. */
  sort: SortOption | null
): Promise<ReportDto[]> {
  const votes = await viewerVotes(
    reports.map((report) => report.id),
    viewerId
  )
  const decorated = reports.map((report) => ({
    ...withReportFreshness(report),
    myVote: votes.get(report.id) ?? null,
    isOwner: viewerId !== null && report.authorId === viewerId,
  }))
  return sort ? sortReports(decorated, sort) : decorated
}

export async function listReports(
  filters: ReportFilters,
  viewerId: string | null
): Promise<ReportDto[]> {
  const { ok, scope } = await knownScope(filters.lguSlug)
  if (!ok) return []

  const reports = await cachedPublicReports(
    scope,
    filters.level ?? null,
    since(filters.recency ?? DEFAULT_RECENCY, nowBucket()),
    filters.limit ?? 100
  )
  return decorateReports(reports, viewerId, filters.sort ?? "recent")
}

/**
 * Deliberately uncached.
 *
 * Every write route reads the row back through this and hands the result
 * straight to broadcast(), so a cached read here would push pre-write counts
 * out over the socket and visually undo the viewer's own vote — wrong data
 * rather than merely stale. It is a primary-key lookup, so there is little to
 * win by caching it anyway.
 */
export async function getReport(
  id: string,
  viewerId: string | null
): Promise<ReportDto | null> {
  const row = await prisma.floodReport.findFirst({
    where: { id, deletedAt: null },
    include: {
      ...reportInclude,
      votes: { select: { value: true, userId: true } },
    },
  })
  return row ? toReport(row, viewerId) : null
}

export type ManageReportFilters = {
  /** Free text over the location name and the reporter's description. */
  q?: string | null
  lguSlug?: string | null
  level?: WaterLevel | null
  status?: ReportStatus
  order?: ReportOrder
  skip?: number
  limit?: number
}

/**
 * Every report an official can act on, one page at a time.
 *
 * Deliberately uncached, and for two reasons rather than one. The obvious one
 * is freshness: this is the screen an officer verifies and removes from, and it
 * has to show the result of their own last action. The other is the key space —
 * the console filters on free text, which perScope's memoised-wrapper-per-key
 * approach cannot bound the way `knownScope` bounds the twenty-two areas.
 *
 * The resident feed's recency window is absent on purpose: the reports it has
 * already dropped are exactly the ones an officer still has to work through.
 */
export async function listAllReports(
  filters: ManageReportFilters,
  viewerId: string | null
): Promise<ManageReportsDto> {
  const { ok, scope } = await knownScope(filters.lguSlug)
  if (!ok) return { reports: [], total: 0 }

  const q = filters.q?.trim()
  const status = filters.status ?? "all"

  // Soft-deleted reports stay out: removing one is how an officer takes it off
  // the map, so it must not come straight back on the console.
  const where = {
    deletedAt: null,
    ...(scope ? { lgu: { slug: scope } } : {}),
    ...(filters.level ? { waterLevel: filters.level } : {}),
    ...(status === "verified" ? { verifiedAt: { not: null } } : {}),
    ...(status === "unverified" ? { verifiedAt: null } : {}),
    ...(q
      ? {
          OR: [
            { locationName: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.floodReport.findMany({
      where,
      include: reportInclude,
      orderBy: { createdAt: filters.order === "oldest" ? "asc" : "desc" },
      skip: filters.skip ?? 0,
      take: filters.limit ?? MANAGE_PAGE_SIZE,
    }),
    prisma.floodReport.count({ where }),
  ])

  return {
    // Ordered by the database because the page is a window onto a longer list;
    // re-sorting the window in memory would only shuffle the page.
    reports: await decorateReports(rows.map(toPublicReport), viewerId, null),
    total,
  }
}

// ---------------------------------------------------------------- accounts

export type ManageUserFilters = {
  /** Free text over the full name and the email. */
  q?: string | null
  lguSlug?: string | null
  role?: UserRoleFilter
  order?: UserOrder
  skip?: number
  limit?: number
}

/**
 * Every account in the province, one page at a time, for the DRRM office.
 *
 * Uncached for the report console's reasons and one of its own: these rows are
 * people's names, emails and the areas they report from. A shared cache entry
 * of that is worth avoiding even behind an OFFICIAL check, and accounts are
 * read far less often than reports, so there is nothing to buy with it.
 */
export async function listUsers(
  filters: ManageUserFilters,
  viewerId: string | null
): Promise<ManageUsersDto> {
  const { ok, scope } = await knownScope(filters.lguSlug)
  if (!ok) return { users: [], total: 0 }

  const q = filters.q?.trim()
  const role = filters.role ?? "all"

  const where = {
    ...(scope ? { lgu: { slug: scope } } : {}),
    ...(role === "all" ? {} : { role }),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        lgu: { select: { slug: true, name: true } },
        // Filtered so a removed report stops counting against its author —
        // the console shows what someone has standing, not what they once
        // filed.
        _count: { select: { reports: { where: { deletedAt: null } } } },
      },
      orderBy:
        filters.order === "name"
          ? [{ fullName: "asc" }, { createdAt: "desc" }]
          : { createdAt: "desc" },
      skip: filters.skip ?? 0,
      take: filters.limit ?? MANAGE_PAGE_SIZE,
    }),
    prisma.user.count({ where }),
  ])

  return {
    users: rows.map((row) => toManagedUser(row, viewerId)),
    total,
  }
}

// ----------------------------------------------------------- zones, gauges

const cachedZones = perScope(
  "zones",
  async (scope): Promise<ZoneDto[]> => {
    const rows = await prisma.safeZone.findMany({
      where: { deletedAt: null, ...(scope ? { lgu: { slug: scope } } : {}) },
      include: { lgu: { select: { slug: true, name: true } } },
      orderBy: { name: "asc" },
    })
    return rows.map(toZone)
  },
  (scope) => (scope ? [tags.zonesIn(scope)] : [tags.zones]),
  TTL.zones
)

export async function listZones(lguSlug?: string | null): Promise<ZoneDto[]> {
  const { ok, scope } = await knownScope(lguSlug)
  return ok ? cachedZones(scope) : []
}

/** The evacuation card always totals the whole province, whatever the scope. */
const cachedEvacuationTotals = unstable_cache(
  async () =>
    prisma.safeZone.findMany({
      where: { deletedAt: null },
      select: { capacity: true, occupancy: true },
    }),
  ["evacuation-totals"],
  { revalidate: TTL.zones, tags: [tags.zones] }
)

const cachedGauges = perScope(
  "gauges",
  async (scope): Promise<GaugeDto[]> => {
    const rows = await prisma.riverGauge.findMany({
      where: scope ? { lgu: { slug: scope } } : {},
      include: { lgu: { select: { slug: true } } },
      orderBy: { name: "asc" },
    })
    return rows.map(toGauge)
  },
  (scope) => (scope ? [tags.gaugesIn(scope)] : [tags.gauges]),
  TTL.gauges
)

export async function listGauges(lguSlug?: string | null): Promise<GaugeDto[]> {
  const { ok, scope } = await knownScope(lguSlug)
  return ok ? cachedGauges(scope) : []
}

// ----------------------------------------------------------------- alerts

/**
 * One tag and one TTL for every alert read, scoped or not — see lib/server/cache.ts
 * for why per-area alert tags cannot work. The TTL is not optional here: alerts
 * leave the list by clock, through the expiresAt comparison below, and nothing
 * ever writes `active: false`, so no invalidation could ever fire for an expiry.
 */
const cachedPublicAlerts = perScope(
  "public-alerts",
  async (scope, at: number): Promise<AlertDto[]> => {
    const rows = await prisma.alert.findMany({
      where: {
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date(at) } }],
        ...(scope
          ? {
              AND: [
                {
                  OR: [
                    { scope: "PROVINCE" as const },
                    { areas: { some: { lgu: { slug: scope } } } },
                  ],
                },
              ],
            }
          : {}),
      },
      include: {
        areas: { include: { lgu: { select: { slug: true, name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    })
    // Serialised without a viewer: `dismissed` is layered on per request below.
    return rows.map((row) => toAlert(row, null))
  },
  () => [tags.alerts],
  TTL.alerts
)

/**
 * Alerts the viewer should see: province-wide ones plus any addressed to the
 * area in scope (or, with no scope, every area). Dismissals are per person, so
 * they are read separately and merged rather than cached with the alert.
 */
export async function listAlerts(
  viewerId: string | null,
  lguSlug?: string | null
): Promise<AlertDto[]> {
  const { ok, scope } = await knownScope(lguSlug)
  const cached = await cachedPublicAlerts(scope, nowBucket())
  // An area that does not exist matches no AlertArea row, so the scoped query
  // would have returned the province-wide alerts and nothing else. Filtering
  // the unscoped list says the same thing without minting an entry for it.
  const alerts = ok ? cached : cached.filter((a) => a.scope === "PROVINCE")
  if (!viewerId || alerts.length === 0) return alerts

  const dismissals = await prisma.alertDismissal.findMany({
    where: { userId: viewerId, alertId: { in: alerts.map((a) => a.id) } },
    select: { alertId: true },
  })
  const dismissed = new Set(dismissals.map((row) => row.alertId))
  return alerts.map((alert) => ({
    ...alert,
    dismissed: dismissed.has(alert.id),
  }))
}

// -------------------------------------------------------------- dashboard

/** Everything the dashboard renders, assembled from the cached pieces above. */
export async function getDashboard(
  filters: ReportFilters,
  viewerId: string | null
): Promise<DashboardDto> {
  const { ok, scope } = await knownScope(filters.lguSlug)
  const createdAfter = since(filters.recency ?? DEFAULT_RECENCY, nowBucket())

  // An unknown area empties the scoped panels but leaves the province-wide
  // ones — the rollup and the evacuation total — exactly as they were.
  const [lgus, reports, zones, gauges, allZones, scopeCount, rollup] =
    await Promise.all([
      cachedLgus(),
      ok
        ? cachedPublicReports(
            scope,
            filters.level ?? null,
            createdAfter,
            filters.limit ?? 100
          )
        : Promise.resolve<PublicReportDto[]>([]),
      ok ? cachedZones(scope) : Promise.resolve<ZoneDto[]>([]),
      ok ? cachedGauges(scope) : Promise.resolve<GaugeDto[]>([]),
      cachedEvacuationTotals(),
      ok ? cachedScopeCount(scope, createdAfter) : Promise.resolve(0),
      cachedRollup(createdAfter),
    ])

  return {
    lgu: lgus.find((lgu) => lgu.slug === scope) ?? null,
    reports: await decorateReports(reports, viewerId, filters.sort ?? "recent"),
    totalInScope: scopeCount,
    gauges,
    zones,
    lgus: summariseLgus(lgus, rollup),
    evacuation: summariseEvacuation(allZones),
    // Stamped out here rather than inside a cached function, where it would
    // freeze and report the age of the entry instead of the age of the answer.
    generatedAt: new Date().toISOString(),
  }
}
