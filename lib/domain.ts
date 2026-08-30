/**
 * Domain constants lifted verbatim from the design prototype
 * (docs/ui-mockups-pending-scope/project/Pampanga Flood Watch.dc.html).
 * Colours, ranks and letters must stay in lockstep with the map component.
 */

export const WATER_LEVELS = ["ANKLE", "KNEE", "CAR_DEEP", "IMPASSABLE"] as const
export type WaterLevel = (typeof WATER_LEVELS)[number]

export const ALERT_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const
export type AlertPriority = (typeof ALERT_PRIORITIES)[number]

export const ALERT_TYPES = [
  "FLOOD_WARNING",
  "EVACUATION_ORDER",
  "ROAD_CLOSURE",
  "GENERAL",
] as const
export type AlertType = (typeof ALERT_TYPES)[number]

export const ZONE_TYPES = [
  "SHELTER",
  "EVACUATION_POINT",
  "HIGH_GROUND",
] as const
export type ZoneType = (typeof ZONE_TYPES)[number]

export const ALARM_LEVELS = ["NORMAL", "FIRST", "SECOND", "THIRD"] as const
export type AlarmLevel = (typeof ALARM_LEVELS)[number]

export const GAUGE_TRENDS = ["rising", "steady", "falling"] as const
export type GaugeTrend = (typeof GAUGE_TRENDS)[number]

export type Language = "en" | "tl"

/** Water-level chip / pin colours. `fg` is the readable foreground on `color`. */
export const LEVEL_META: Record<
  WaterLevel,
  { color: string; fg: string; letter: string; rank: number }
> = {
  ANKLE: { color: "#fbbf24", fg: "#422006", letter: "A", rank: 1 },
  KNEE: { color: "#f97316", fg: "#ffffff", letter: "K", rank: 2 },
  CAR_DEEP: { color: "#ef4444", fg: "#ffffff", letter: "C", rank: 3 },
  IMPASSABLE: { color: "#991b1b", fg: "#ffffff", letter: "X", rank: 4 },
}

export const PRIORITY_COLOR: Record<AlertPriority, string> = {
  LOW: "#6b7280",
  MEDIUM: "#2563eb",
  HIGH: "#ea580c",
  CRITICAL: "#dc2626",
}

export const ZONE_COLOR: Record<ZoneType, string> = {
  SHELTER: "#16a34a",
  EVACUATION_POINT: "#0d9488",
  HIGH_GROUND: "#0284c7",
}

export const ALARM_COLOR: Record<AlarmLevel, string> = {
  NORMAL: "#16a34a",
  FIRST: "#f59e0b",
  SECOND: "#ea580c",
  THIRD: "#dc2626",
}

/** Province-level map focus used by the prototype. */
export const PROVINCE_CENTER = { lat: 15.03, lng: 120.69 } as const
export const PROVINCE_ZOOM = 10
export const LGU_ZOOM = 13
export const PICKER_ZOOM = 14

/** How precise a place-search hit is. It decides only how far the picker flies. */
export const PLACE_KINDS = ["area", "locality", "street", "spot"] as const
export type PlaceKind = (typeof PLACE_KINDS)[number]

/**
 * Where the picker lands for each kind of hit. Capped at 16: at this latitude
 * that is 2.3 m/px, so the 230px picker box shows about 530 m, which is close
 * enough to confirm a crossing without losing the surrounding streets.
 */
export const PLACE_ZOOM: Record<PlaceKind, number> = {
  area: LGU_ZOOM,
  locality: 15,
  street: 16,
  spot: 16,
}

/**
 * A generous box around Pampanga, sent to the geocoder as a relevance bound.
 * It is NOT a province filter - Photon answers "macarthur highway mexico" with
 * a Bulacan segment that sits inside this rectangle - so the adapter also drops
 * anything whose state is not Pampanga. Loose at the edges on purpose: someone
 * on the Bulacan or Bataan line is still reporting a Pampanga flood.
 */
export const PROVINCE_BBOX = {
  west: 120.33,
  south: 14.72,
  east: 121.05,
  north: 15.45,
} as const

/** Photon's own name for the province, as it appears in `properties.state`. */
export const PROVINCE_NAME = "Pampanga"

/**
 * A GPS fix is only worth the zoom its accuracy earns.
 *
 * The picker box is 230px tall, so at this latitude zoom 16 shows about 530m
 * and zoom 18 about 130m. Flying to street level on a 500m fix would draw a
 * confident pin on one specific corner the phone never actually identified,
 * which is worse data than an honest wide shot: the reporter cannot correct a
 * mistake they cannot see. Framing the uncertainty is the point.
 */
export function zoomForAccuracy(metres: number): number {
  if (metres <= 25) return 18
  if (metres <= 75) return 17
  if (metres <= 200) return 16
  if (metres <= 600) return 15
  return PICKER_ZOOM
}

/** "80 m" / "1.2 km". The units read the same in both languages. */
export function formatMetres(metres: number): string {
  return metres >= 1000
    ? `${(metres / 1000).toFixed(1)} km`
    : `${Math.round(metres)} m`
}

/** Above this a fix is reported as rough, with the figure spelled out. */
export const ROUGH_FIX_METRES = 100

/** A report is flagged "New" while it is younger than this. */
export const NEW_REPORT_MINUTES = 10
/** Reports older than this drop out of the default "live" feed. */
export const DEFAULT_RECENCY_MINUTES = 1440
export const DESCRIPTION_MAX = 500
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024

export const RECENCY_OPTIONS = ["30", "60", "1440", "all"] as const
export type Recency = (typeof RECENCY_OPTIONS)[number]

/** The window the dashboard opens on, in the URL only when it is not this. */
export const DEFAULT_RECENCY: Recency = String(
  DEFAULT_RECENCY_MINUTES
) as Recency

export const SORT_OPTIONS = ["recent", "voted"] as const
export type SortOption = (typeof SORT_OPTIONS)[number]

/**
 * Filters on the officials' report console. They are deliberately not the
 * resident dashboard's: an officer works a backlog rather than a live feed, so
 * the console filters by verification state and can walk the list oldest first.
 */
export const REPORT_STATUSES = ["all", "verified", "unverified"] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

export const REPORT_ORDERS = ["newest", "oldest"] as const
export type ReportOrder = (typeof REPORT_ORDERS)[number]

/** Rows a console asks for at a time; "Load more" asks for the next page. */
export const MANAGE_PAGE_SIZE = 50

/**
 * Filters on the accounts console. Role doubles as the filter and the value an
 * officer can set, so "all" is kept out of the settable pair rather than being
 * a role nobody holds.
 */
export const USER_ROLE_FILTERS = ["all", "OFFICIAL", "RESIDENT"] as const
export type UserRoleFilter = (typeof USER_ROLE_FILTERS)[number]

export const USER_ORDERS = ["newest", "name"] as const
export type UserOrder = (typeof USER_ORDERS)[number]

/** Shortest password the app accepts, wherever one is set. */
export const PASSWORD_MIN = 8

export function levelRank(level: WaterLevel): number {
  return LEVEL_META[level].rank
}

/** Worst (deepest) of two levels, mirroring the prototype's RANK comparison. */
export function worstLevel(
  a: WaterLevel | null | undefined,
  b: WaterLevel | null | undefined
): WaterLevel | null {
  if (!a) return b ?? null
  if (!b) return a
  return levelRank(a) >= levelRank(b) ? a : b
}

/** "1,234" - the prototype's fmtN. */
export function formatCount(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

export function minutesSince(date: Date | string | number): number {
  const then = new Date(date).getTime()
  return Math.max(0, Math.round((Date.now() - then) / 60000))
}

/** "4 min ago" / "4 min ang nakalipas" - the prototype's ago(). */
export function formatAgo(minutes: number, lang: Language): string {
  if (lang === "en") {
    return minutes < 60
      ? `${minutes} min ago`
      : `${Math.round(minutes / 60)} hr ago`
  }
  return minutes < 60
    ? `${minutes} min ang nakalipas`
    : `${Math.round(minutes / 60)} oras ang nakalipas`
}

export function formatCoords(lat: number, lng: number, digits = 5): string {
  return `${lat.toFixed(digits)}, ${lng.toFixed(digits)}`
}

export function initialsFor(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter((p) => /^[A-Za-zÀ-ÿ]/.test(p))
    .slice(-2)
    .map((p) => p[0]!.toUpperCase())
    .join("")
    .slice(0, 2)
}
