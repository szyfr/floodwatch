/**
 * Wire shapes shared by the route handlers, the socket server and the client.
 * Dates cross the wire as ISO strings.
 */
import type {
  AlarmLevel,
  AlertPriority,
  AlertType,
  GaugeTrend,
  Language,
  PlaceKind,
  WaterLevel,
  ZoneType,
} from "@/lib/domain"

export type Role = "RESIDENT" | "OFFICIAL"
export type VoteValue = "UP" | "DOWN"
export type AlertScope = "PROVINCE" | "AREAS"

export type LguDto = {
  id: string
  slug: string
  name: string
  lat: number
  lng: number
  isCity: boolean
  registeredResidents: number
}

/** An LGU plus the aggregate the province map and area sheet render. */
export type LguSummaryDto = LguDto & {
  reportCount: number
  worstLevel: WaterLevel | null
  latestMinutesAgo: number | null
}

/**
 * One place the picker can jump to.
 *
 * Provider-neutral on purpose. Nothing here is the geocoder's shape - no
 * osm_id, no [lon,lat] tuple, no `extent` (Photon's is [W,N,E,S], which is not
 * GeoJSON order and is a silent bug waiting to happen). Swapping geocoders is a
 * change to lib/server/geocode.ts and nothing else.
 */
export type PlaceDto = {
  /** Stable within one response only. A list key, never something to store. */
  id: string
  /**
   * The headline, already composed: "Sindalan", "Guagua Public Market".
   * Between 2 and 160 characters, because it can be dropped straight into
   * locationName, which createReportSchema bounds at exactly that.
   */
  label: string
  /** The quieter second line, or null when it would only repeat the label. */
  context: string | null
  lat: number
  lng: number
  kind: PlaceKind
  /**
   * The LGU slug, but only when the geocoder NAMED a municipality on our
   * roster. Never a nearest-centroid guess: that is wrong exactly at
   * boundaries, which is where flooding gets reported.
   */
  area: string | null
}

/**
 * The picker's answer. `degraded` says the geocoder was not asked at all - the
 * province-wide ceiling was in force and this is whatever the cache held - so
 * an empty list means "we did not look", not "nothing is there". The UI has to
 * be able to tell those apart, or it tells a reporter their barangay does not
 * exist on the busiest night of the year.
 */
export type PlacesDto = {
  places: PlaceDto[]
  degraded?: boolean
}

/** A report as everyone sees it - no viewer-specific fields. */
export type PublicReportDto = {
  id: string
  lguId: string
  lguSlug: string
  lguName: string
  locationName: string
  description: string | null
  descriptionTl: string | null
  waterLevel: WaterLevel
  lat: number
  lng: number
  photoUrl: string | null
  upvotes: number
  downvotes: number
  verified: boolean
  authorId: string | null
  /** Display name of the reporter, or null when they posted anonymously. */
  authorName: string | null
  createdAt: string
  updatedAt: string
  /** Younger than NEW_REPORT_MINUTES. */
  isNew: boolean
}

/** A report decorated for the signed-in viewer. */
export type ReportDto = PublicReportDto & {
  myVote: VoteValue | null
  isOwner: boolean
}

/**
 * One page of the officials' report console. `total` counts every report the
 * filters match, not just the rows in this page, so the header can say how much
 * backlog is left behind the "Load more".
 */
export type ManageReportsDto = {
  reports: ReportDto[]
  total: number
}

export type AlertDto = {
  id: string
  title: string
  titleTl: string | null
  message: string
  messageTl: string | null
  type: AlertType
  priority: AlertPriority
  scope: AlertScope
  areas: { slug: string; name: string }[]
  sentBy: string
  createdAt: string
  dismissed: boolean
}

export type ZoneDto = {
  id: string
  lguId: string
  lguSlug: string
  lguName: string
  name: string
  type: ZoneType
  lat: number
  lng: number
  capacity: number | null
  occupancy: number
  contactName: string | null
  contactPhone: string | null
}

export type GaugeDto = {
  id: string
  code: string
  lguSlug: string
  name: string
  lat: number
  lng: number
  readingMetres: number
  alarmLevel: AlarmLevel
  trend: GaugeTrend
  deltaPerHour: number
  observedAt: string
}

/** The "Evacuation centres" card on the province view. */
export type EvacuationSummaryDto = {
  openCentres: number
  capacity: number
  occupancy: number
  percent: number
}

/**
 * An account as the officials' console sees it. A superset of SessionUserDto
 * rather than a reuse of it: the console needs the row's own history - when it
 * was opened, how much the person has filed - which the viewer's own session
 * has no business carrying.
 */
export type ManagedUserDto = {
  id: string
  email: string
  fullName: string
  initials: string
  role: Role
  organisation: string | null
  language: Language
  lguSlug: string
  lguName: string
  /** Reports still standing - a removed one is not held against its author. */
  reportCount: number
  createdAt: string
  /** The viewer's own account, which the console guards differently. */
  isSelf: boolean
}

/** One page of the accounts console; `total` counts every match, not the page. */
export type ManageUsersDto = {
  users: ManagedUserDto[]
  total: number
}

export type SessionUserDto = {
  id: string
  email: string
  fullName: string
  initials: string
  role: Role
  organisation: string | null
  language: Language
  lguSlug: string
  lguName: string
}

/** Everything the dashboard needs in one round-trip. */
export type DashboardDto = {
  /** null while the province view is active. */
  lgu: LguDto | null
  reports: ReportDto[]
  /** Reports in scope before level/recency filters - drives the pins. */
  totalInScope: number
  gauges: GaugeDto[]
  zones: ZoneDto[]
  lgus: LguSummaryDto[]
  evacuation: EvacuationSummaryDto
  generatedAt: string
}

export type ApiError = {
  error: string
  code?: string
  fields?: Record<string, string>
}
