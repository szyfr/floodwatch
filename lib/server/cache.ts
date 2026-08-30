import "server-only"

import { revalidateTag } from "next/cache"

/**
 * Cache tags for the shared, viewer-independent reads in lib/server/queries.ts.
 *
 * Two levels per entity. A province-wide entry carries only the broad tag; an
 * entry scoped to one city or municipality carries only that area's tag. A
 * write in San Fernando therefore drops the province-wide entries and San
 * Fernando's, and leaves the other twenty-one areas' entries standing — which
 * matters most during a flood, when one hard-hit area would otherwise keep
 * invalidating the whole province's cache.
 *
 * The split only holds if every cached read tags itself on exactly one level.
 * Tagging a scoped entry with the broad tag as well would quietly collapse the
 * granularity back to "invalidate everything".
 */
export const tags = {
  lgus: "lgus",
  reports: "reports",
  reportsIn: (slug: string) => `reports:lgu:${slug}`,
  /**
   * The province-wide per-area rollup behind the map bubbles and the area
   * sheet. Separate from `reports` because it aggregates only lguId, waterLevel
   * and createdAt — a vote cannot move it, and votes are the most frequent
   * write there is during a flood.
   */
  reportsRollup: "reports:rollup",
  /**
   * One tag for every alert read, scoped or not. Per-area alert tags look
   * tempting and are a trap: a PROVINCE-scope alert stores no AlertArea rows
   * yet belongs in all twenty-two areas' lists, and the unscoped list the app
   * shell reads on every page would belong to no area tag at all and quietly
   * go stale. Alerts are written once per broadcast, so one tag costs nothing.
   */
  alerts: "alerts",
  zones: "zones",
  zonesIn: (slug: string) => `zones:lgu:${slug}`,
  gauges: "gauges",
  gaugesIn: (slug: string) => `gauges:lgu:${slug}`,
} as const

/**
 * The helpers below are called from the write sites, next to the broadcast()
 * that tells connected clients. The two are complementary and neither replaces
 * the other: realtime patches the browsers that already have the page open,
 * while these drop the server caches so the next render — and anyone arriving
 * fresh, or reconnecting after being offline — sees the write too.
 *
 * revalidateTag rather than updateTag: updateTag throws anywhere outside a
 * Server Action, and every write site here is a route handler.
 */

/**
 * Expire the tag now instead of allowing a stale-while-revalidate window.
 *
 * revalidateTag's second argument became required in Next 16 — calling it with
 * one argument still works but warns — and the profile it names decides how
 * long an already-invalidated entry may go on being served while it refreshes
 * behind the scenes. The deprecation notice suggests "max", which is the
 * longest such window. This app broadcasts evacuation orders, so it asks for no
 * window at all: expire 0 is the branch that marks the data fully revalidated.
 */
const IMMEDIATE = { expire: 0 } as const

/** Slugs an edit touched — a report that moved area belongs to both. */
function areaTags(
  slugs: (string | null | undefined)[],
  tag: (slug: string) => string
): string[] {
  return [...new Set(slugs.filter((slug): slug is string => Boolean(slug)))].map(
    tag
  )
}

/**
 * A report was filed, edited or removed. A report that moved between areas
 * belongs to both, so pass the old slug as well as the new one.
 */
export function revalidateReports(
  ...slugs: (string | null | undefined)[]
): void {
  revalidateTag(tags.reports, IMMEDIATE)
  revalidateTag(tags.reportsRollup, IMMEDIATE)
  for (const tag of areaTags(slugs, tags.reportsIn)) {
    revalidateTag(tag, IMMEDIATE)
  }
}

/**
 * A vote landed. Votes move `upvotes`/`downvotes`, which are columns on the
 * report itself and decide the order of the "most voted" list, so the shared
 * report lists genuinely have to go. The rollup is spared: it counts reports
 * and takes the worst water level, neither of which a vote can change.
 */
export function revalidateReportVotes(slug: string | null | undefined): void {
  revalidateTag(tags.reports, IMMEDIATE)
  for (const tag of areaTags([slug], tags.reportsIn)) {
    revalidateTag(tag, IMMEDIATE)
  }
}

export function revalidateAlerts(): void {
  revalidateTag(tags.alerts, IMMEDIATE)
}

export function revalidateZones(...slugs: (string | null | undefined)[]): void {
  revalidateTag(tags.zones, IMMEDIATE)
  for (const tag of areaTags(slugs, tags.zonesIn)) {
    revalidateTag(tag, IMMEDIATE)
  }
}

export function revalidateGauges(...slugs: (string | null | undefined)[]): void {
  revalidateTag(tags.gauges, IMMEDIATE)
  for (const tag of areaTags(slugs, tags.gaugesIn)) {
    revalidateTag(tag, IMMEDIATE)
  }
}
