/**
 * Geometry, colour lookups and divIcon markup for the flood map, ported from
 * the prototype's <pampanga-map> custom element
 * (docs/ui-mockups-pending-scope/project/pampanga-map.js:12-26, 71-72, 242-326).
 *
 * The marker bodies are raw HTML strings because Leaflet's `divIcon` takes a
 * string, so the classes they name must stay in the global pampanga-map.css.
 */
import {
  ALARM_COLOR,
  LEVEL_META,
  ZONE_COLOR,
  type AlarmLevel,
  type WaterLevel,
  type ZoneType,
} from "@/lib/domain"

/**
 * Stadia Maps' OSM Bright: buildings with real outlines, road hierarchy in
 * colour, and street names at the zooms where a reporter drops a pin.
 *
 * The design mocked this up on Esri's Light Gray Canvas, and Stadia's closest
 * equivalent is `alidade_smooth` - swap the style segment below if you ever
 * want it. It was tried and rejected for the same reason Light Gray Canvas
 * was: at z17 over San Fernando it labels two streets to OSM Bright's five and
 * renders buildings light-grey on white. A resident locating their flooded
 * street navigates by those labels, so legibility beats the paler mockup.
 *
 * Addressed {z}/{x}/{y}. Esri's ArcGIS services use {z}/{y}/{x} - row before
 * column - so swapping providers means swapping this too.
 *
 * `{r}` is Leaflet's retina placeholder, and it resolves to "@2x" from
 * `Browser.retina` alone - it does NOT need, and must not get, the
 * `detectRetina` option. That option also halves `tileSize` and bumps
 * `zoomOffset`, which asks for tiles a zoom level deeper and quadruples both
 * the request count and the bill. `{r}` on its own buys a sharper map on the
 * phones most reports come from at exactly the same number of tiles.
 *
 * Authentication is by domain allowlist, deliberately and only: the browser
 * sends `Origin` and `Referer`, Stadia matches them against the properties on
 * the account, and no credential exists to ship in the bundle. `localhost` and
 * `127.0.0.1` are exempt (under tight rate limits), so development needs no
 * setup at all.
 *
 * Two consequences worth knowing. Serving this app under a hostname that is
 * not on the allowlist answers every tile with 401 and draws a blank map. And
 * a `Referrer-Policy: no-referrer` header anywhere in the stack strips the
 * evidence Stadia authenticates on, with the same result.
 *
 * There is no API-key fallback on purpose. Stadia's key travels as a query
 * parameter, so on a public site it would be inlined into the client bundle at
 * build time and published to every visitor. If some future host genuinely
 * cannot be allowlisted, add the key here consciously - restricted to that
 * property in the Stadia dashboard, and treated as published, never a secret.
 */
export const TILE_URL =
  "https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.png"

export const TILE_ATTRIBUTION =
  '&copy; <a href="https://stadiamaps.com/" target="_blank" rel="noopener noreferrer">Stadia Maps</a> ' +
  '&copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'

/** OSM Bright has real tiles to 20 - one deeper than OSM's own raster. */
export const TILE_MAX_ZOOM = 20

/** Rivers, the focus ring, the picker pin and the selected pin all share it. */
export const MAP_BLUE = "#2563eb"
/** Bubble fill for an LGU with no reports in scope. */
export const NO_REPORTS_COLOR = "#a3a3a3"
/** Pin fill when a report carries no recognised water level. */
export const UNKNOWN_LEVEL_COLOR = "#6b7280"

/** Approximate course of the Pampanga River through the province. */
export const RIVER: [number, number][] = [
  [15.216, 120.798],
  [15.17, 120.802],
  [15.12, 120.808],
  [15.062, 120.802],
  [15.01, 120.792],
  [14.978, 120.78],
  [14.95, 120.764],
  [14.922, 120.74],
  [14.898, 120.722],
  [14.874, 120.712],
  [14.848, 120.706],
]

export const RIO_CHICO: [number, number][] = [
  [15.108, 120.86],
  [15.07, 120.824],
  [15.03, 120.8],
  [15.01, 120.792],
]

/** Dashed ring drawn around the focused LGU, in metres. */
export const FOCUS_RING_RADIUS = 4200

const SHIELD_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/></svg>'
const DROP_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l5 6.6a6.2 6.2 0 11-10 0z"/></svg>'

/** Province bubble diameter in px: 26 when quiet, then √count, capped at 56. */
export function bubbleDiameter(count: number): number {
  return count === 0 ? 26 : Math.min(56, 30 + Math.round(Math.sqrt(count) * 7))
}

/** Names reach the marker HTML as text; Leaflet writes these strings as HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function levelMeta(level: WaterLevel | null | undefined) {
  return level ? LEVEL_META[level] : null
}

export function bubbleHtml(bubble: {
  name: string
  count: number
  worst: WaterLevel | null
}): string {
  const meta = levelMeta(bubble.worst)
  const size = bubbleDiameter(bubble.count)
  return (
    `<div class="pm-bub" style="width:${size}px;height:${size}px">` +
    `<b style="background:${meta?.color ?? NO_REPORTS_COLOR};color:${meta?.fg ?? "#fff"}">` +
    `${bubble.count || "·"}</b>` +
    `<i style="top:${size + 3}px">${escapeHtml(bubble.name)}</i></div>`
  )
}

export function pinHtml(
  pin: { level: WaterLevel; isNew: boolean },
  labels: boolean,
  selected: boolean
): string {
  const meta = levelMeta(pin.level)
  const color = meta?.color ?? UNKNOWN_LEVEL_COLOR
  return (
    `<div class="pm-pin${selected ? " pm-sel" : ""}" style="--pm-c:${color}">` +
    (pin.isNew ? '<span class="pm-halo"></span>' : "") +
    `<span class="pm-dot" style="background:${color};color:${meta?.fg ?? "#fff"}">` +
    (labels ? (meta?.letter ?? "•") : "") +
    "</span></div>"
  )
}

export function zoneHtml(type: ZoneType): string {
  const color = ZONE_COLOR[type] ?? ZONE_COLOR.SHELTER
  return `<div class="pm-zone" style="background:${color}">${SHIELD_SVG}</div>`
}

export function gaugeHtml(alarm: AlarmLevel): string {
  const color = ALARM_COLOR[alarm] ?? ALARM_COLOR.NORMAL
  return `<div class="pm-gauge" style="background:${color}">${DROP_SVG}</div>`
}

/** The blue check dropped where the reporter tapped, in picker mode. */
export const PICK_PIN_HTML = `<div class="pm-pin"><span class="pm-dot" style="background:${MAP_BLUE};color:#fff">✓</span></div>`

/** Tooltip text is set through innerHTML, so escape there too. */
export function tooltipText(value: string): string {
  return escapeHtml(value)
}
