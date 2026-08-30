/**
 * Prisma row → wire DTO. Kept structural (no generated types) so it can be
 * exercised from tests and the seed script without a database round-trip.
 */
import {
  LEVEL_META,
  NEW_REPORT_MINUTES,
  initialsFor,
  minutesSince,
  worstLevel,
  type Language,
  type AlarmLevel,
  type GaugeTrend,
  type WaterLevel,
  type ZoneType,
} from "@/lib/domain"
import type {
  AlertDto,
  EvacuationSummaryDto,
  GaugeDto,
  LguDto,
  LguSummaryDto,
  ManagedUserDto,
  Role,
  PublicReportDto,
  ReportDto,
  VoteValue,
  ZoneDto,
} from "@/lib/dto"

type LguRow = {
  id: string
  slug: string
  name: string
  lat: number
  lng: number
  isCity: boolean
  registeredResidents: number
}

type ReportRow = {
  id: string
  lguId: string
  locationName: string
  description: string | null
  descriptionTl: string | null
  waterLevel: string
  lat: number
  lng: number
  photoUrl: string | null
  upvotes: number
  downvotes: number
  verifiedAt: Date | null
  authorId: string | null
  createdAt: Date
  updatedAt: Date
  lgu: { slug: string; name: string }
  author?: { fullName: string; organisation: string | null } | null
  votes?: { value: string; userId: string }[]
}

export function toPublicReport(row: ReportRow): PublicReportDto {
  return {
    id: row.id,
    lguId: row.lguId,
    lguSlug: row.lgu.slug,
    lguName: row.lgu.name,
    locationName: row.locationName,
    description: row.description,
    descriptionTl: row.descriptionTl,
    waterLevel: row.waterLevel as WaterLevel,
    lat: row.lat,
    lng: row.lng,
    photoUrl: row.photoUrl,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    verified: row.verifiedAt !== null,
    authorId: row.authorId,
    authorName: row.author
      ? row.author.organisation || row.author.fullName
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isNew: minutesSince(row.createdAt) < NEW_REPORT_MINUTES,
  }
}

/** Adds the two viewer-specific fields the cards need. */
export function toReport(row: ReportRow, viewerId: string | null): ReportDto {
  const mine = viewerId
    ? row.votes?.find((v) => v.userId === viewerId)
    : undefined
  return {
    ...toPublicReport(row),
    myVote: (mine?.value as VoteValue | undefined) ?? null,
    isOwner: viewerId !== null && row.authorId === viewerId,
  }
}

/**
 * Re-stamps the fields that are relative to "now" rather than to the row.
 *
 * toPublicReport decides `isNew` at the moment it serialises, which is right
 * everywhere except behind a cache: an entry written once and then served for
 * the rest of its lifetime would keep insisting a report is new long after it
 * stopped being one. The cached read path re-stamps on the way out, so the flag
 * tracks the clock rather than the cache.
 */
export function withReportFreshness<T extends PublicReportDto>(report: T): T {
  return {
    ...report,
    isNew: minutesSince(report.createdAt) < NEW_REPORT_MINUTES,
  }
}

type AlertRow = {
  id: string
  title: string
  titleTl: string | null
  message: string
  messageTl: string | null
  type: string
  priority: string
  scope: string
  sentBy: string
  createdAt: Date
  areas: { lgu: { slug: string; name: string } }[]
  dismissals?: { userId: string }[]
}

export function toAlert(row: AlertRow, viewerId: string | null): AlertDto {
  return {
    id: row.id,
    title: row.title,
    titleTl: row.titleTl,
    message: row.message,
    messageTl: row.messageTl,
    type: row.type as AlertDto["type"],
    priority: row.priority as AlertDto["priority"],
    scope: row.scope as AlertDto["scope"],
    areas: row.areas.map((a) => ({ slug: a.lgu.slug, name: a.lgu.name })),
    sentBy: row.sentBy,
    createdAt: row.createdAt.toISOString(),
    dismissed: viewerId
      ? Boolean(row.dismissals?.some((d) => d.userId === viewerId))
      : false,
  }
}

type ZoneRow = {
  id: string
  lguId: string
  name: string
  type: string
  lat: number
  lng: number
  capacity: number | null
  occupancy: number
  contactName: string | null
  contactPhone: string | null
  lgu: { slug: string; name: string }
}

export function toZone(row: ZoneRow): ZoneDto {
  return {
    id: row.id,
    lguId: row.lguId,
    lguSlug: row.lgu.slug,
    lguName: row.lgu.name,
    name: row.name,
    type: row.type as ZoneType,
    lat: row.lat,
    lng: row.lng,
    capacity: row.capacity,
    occupancy: row.occupancy,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
  }
}

type GaugeRow = {
  id: string
  code: string
  name: string
  lat: number
  lng: number
  readingMetres: number
  alarmLevel: string
  trend: string
  deltaPerHour: number
  observedAt: Date
  lgu: { slug: string }
}

export function toGauge(row: GaugeRow): GaugeDto {
  return {
    id: row.id,
    code: row.code,
    lguSlug: row.lgu.slug,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    readingMetres: row.readingMetres,
    alarmLevel: row.alarmLevel as AlarmLevel,
    trend: row.trend.toLowerCase() as GaugeTrend,
    deltaPerHour: row.deltaPerHour,
    observedAt: row.observedAt.toISOString(),
  }
}

type ManagedUserRow = {
  id: string
  email: string
  fullName: string
  role: string
  organisation: string | null
  language: string
  createdAt: Date
  lgu: { slug: string; name: string }
  _count: { reports: number }
}

/**
 * An account row for the officials' console. `viewerId` is threaded in rather
 * than compared on the client because "this is you" decides what the console
 * refuses to do - an officer cannot take their own last powers away - and that
 * judgement belongs on the same side as the endpoint that enforces it.
 */
export function toManagedUser(
  row: ManagedUserRow,
  viewerId: string | null
): ManagedUserDto {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    initials: initialsFor(row.fullName),
    role: (row.role === "OFFICIAL" ? "OFFICIAL" : "RESIDENT") as Role,
    organisation: row.organisation,
    language: (row.language === "tl" ? "tl" : "en") as Language,
    lguSlug: row.lgu.slug,
    lguName: row.lgu.name,
    reportCount: row._count.reports,
    createdAt: row.createdAt.toISOString(),
    isSelf: row.id === viewerId,
  }
}

export function toLgu(row: LguRow): LguDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    isCity: row.isCity,
    registeredResidents: row.registeredResidents,
  }
}

/**
 * Rolls reports up per LGU the way the province map and the area sheet want
 * them: a count, the worst level seen, and how fresh the newest one is.
 */
export function summariseLgus(
  lgus: LguRow[],
  /**
   * `createdAt` is widened to accept an ISO string because these rows reach the
   * cached dashboard path through unstable_cache, which JSON round-trips its
   * payload and so hands back strings where Prisma handed it Dates.
   */
  reports: { lguId: string; waterLevel: string; createdAt: Date | string }[]
): LguSummaryDto[] {
  const agg = new Map<
    string,
    { count: number; worst: WaterLevel | null; newest: Date }
  >()
  for (const r of reports) {
    const current = agg.get(r.lguId)
    const level = r.waterLevel as WaterLevel
    const createdAt = new Date(r.createdAt)
    if (!current) {
      agg.set(r.lguId, { count: 1, worst: level, newest: createdAt })
      continue
    }
    current.count += 1
    current.worst = worstLevel(current.worst, level)
    if (createdAt > current.newest) current.newest = createdAt
  }

  return lgus.map((lgu) => {
    const a = agg.get(lgu.id)
    return {
      ...toLgu(lgu),
      reportCount: a?.count ?? 0,
      worstLevel: a?.worst ?? null,
      latestMinutesAgo: a ? minutesSince(a.newest) : null,
    }
  })
}

/** The "Evacuation centres" card: only zones with a stated capacity count. */
export function summariseEvacuation(
  zones: { capacity: number | null; occupancy: number }[]
): EvacuationSummaryDto {
  const withCapacity = zones.filter(
    (z) => z.capacity !== null && z.capacity > 0
  )
  const capacity = withCapacity.reduce((n, z) => n + (z.capacity ?? 0), 0)
  const occupancy = withCapacity.reduce((n, z) => n + z.occupancy, 0)
  return {
    openCentres: withCapacity.length,
    capacity,
    occupancy,
    percent: capacity ? Math.round((occupancy / capacity) * 100) : 0,
  }
}

/** Sorts reports the way the list controls offer: newest first, or best net vote. */
export function sortReports<
  T extends { upvotes: number; downvotes: number; createdAt: string },
>(reports: T[], sort: "recent" | "voted"): T[] {
  const copy = [...reports]
  if (sort === "voted") {
    copy.sort(
      (a, b) =>
        b.upvotes - b.downvotes - (a.upvotes - a.downvotes) ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt)
    )
  } else {
    copy.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }
  return copy
}

export { LEVEL_META }
