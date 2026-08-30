import "server-only"

import type { PlaceDto } from "@/lib/dto"
import {
  PROVINCE_BBOX,
  PROVINCE_CENTER,
  PROVINCE_NAME,
  type PlaceKind,
} from "@/lib/domain"
import { listLgus } from "@/lib/server/queries"

/**
 * Place search for the picker maps, via Photon (komoot) over OpenStreetMap.
 *
 * Three deliberate policies:
 *
 * It is PROXIED even though Photon needs no key. A browser cannot set a
 * User-Agent, "reasonable use" is a thing this app has to be able to prove, and
 * the bounded cache, the two rate limits, the three-character floor and the
 * timeout all have to live somewhere the client cannot skip. It is also the
 * seam a keyed provider would move into without the key ever reaching a bundle,
 * which is the same argument components/map/map-constants.ts makes about tiles.
 *
 * It is ON by default, inverting the off-unless-configured convention that
 * lib/server/moderation.ts and lib/server/uploads.ts follow. Those need a
 * credential and a bucket; this needs neither, and a search box that is dead
 * until a deployer finds an env var is the wrong default for a control a
 * resident is looking at. GEOCODE_PROVIDER=off is an operator kill switch
 * rather than an opt-in.
 *
 * It FAILS SOFT. A timeout, a 500 or a shape nobody expected logs and returns
 * the failure arm, and the UI says search is down. The picker map and the raw
 * lat/lng inputs are right there on the same screen, so a dead geocoder must
 * never be the reason a flood goes unreported.
 */
const PROVIDER = process.env.GEOCODE_PROVIDER ?? "photon"
const BASE_URL = process.env.GEOCODE_BASE_URL ?? "https://photon.komoot.io"

/** A hung geocoder must not hold a route handler open. */
const TIMEOUT_MS = Number(process.env.GEOCODE_TIMEOUT_MS ?? 4000)

/** Six rows is what the popup shows without scrolling on a phone. */
const LIMIT = 6

/** Shortest query worth sending upstream, checked AFTER normalisation. */
const MIN_QUERY = 3

export const geocodeEnabled = PROVIDER !== "off"

// ------------------------------------------------------------- normalisation

/**
 * The query as the geocoder wants it.
 *
 * The barangay prefixes are the load-bearing part. Photon returns nothing at
 * all for "Brgy Sindalan" and drifts to an unrelated street for "Barangay
 * Sindalan", while bare "Sindalan" is a clean first hit - and a prefix is
 * exactly what a resident types. Folding the variants is also what gives the
 * cache below its hit rate during a flood, when a whole barangay is typing the
 * same dozen names.
 *
 * "sto" and "sta" are deliberately NOT stripped: they are real name parts here
 * (Santo Tomas, Santa Rita), not noise.
 */
function normalise(query: string): string {
  return query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(?:barangay|brgy|bgy|purok|sitio)\s+/, "")
    .trim()
}

// -------------------------------------------------------------------- cache

/**
 * A bounded LRU, insertion-ordered and promoted on read.
 *
 * Deliberately NOT unstable_cache. Its key space here would be arbitrary user
 * text, and lib/server/queries.ts already documents that hazard in this
 * codebase's own words - `knownScope` exists precisely to stop unbounded
 * on-disk entries Next never prunes. The `use cache` directive is not an option
 * either: cacheComponents is off in next.config.ts, on purpose.
 */
const CACHE_MAX = 400
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const cache = new Map<string, { at: number; places: PlaceDto[] }>()

function cacheKey(normalised: string, lang: string): string {
  return `${lang}:${normalised}`
}

function readCache(key: string): PlaceDto[] | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  // Re-insert to move it to the young end; the oldest key is evicted below.
  cache.delete(key)
  cache.set(key, hit)
  return hit.places
}

function writeCache(key: string, places: PlaceDto[]): void {
  cache.set(key, { at: Date.now(), places })
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/** The cached answer for this query, or null. Never reaches the network. */
export function cachedPlaces(query: string, lang: string): PlaceDto[] | null {
  return readCache(cacheKey(normalise(query), lang))
}

// --------------------------------------------------------------- LGU roster

/**
 * An area name reduced to something two sources can agree on. Photon says "San
 * Fernando" or "City of San Fernando, Pampanga"; the roster says "City of San
 * Fernando".
 *
 * Matching on the NAME and nothing else is the whole point. "Nearest of the 22
 * centroids" is wrong exactly at municipal boundaries, which is where flooding
 * gets reported, and several seed centroids are rounded to two or three
 * decimals anyway - roughly a kilometre of slack before the guessing starts.
 */
function foldLgu(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/,\s*pampanga$/, "")
    .replace(/^city of\s+/, "")
    .replace(/\s+city$/, "")
    .replace(/\bsto\b/, "santo")
    .replace(/\bsta\b/, "santa")
    .replace(/\s+/g, " ")
    .trim()
}

/** Real-world spellings the geocoder uses that the roster does not. */
const ALIASES: Record<string, string> = {
  sexmoan: "sasmuan",
}

/** Folded area name to slug, built once per response rather than per feature. */
async function roster(): Promise<Map<string, string>> {
  const lgus = await listLgus()
  return new Map(lgus.map((lgu) => [foldLgu(lgu.name), lgu.slug]))
}

/**
 * The first candidate that names an area on our roster, or null. Candidates
 * arrive most-specific-first and every one of them may be undefined, because
 * Photon fills city, county and district inconsistently by feature type.
 */
function areaSlugFor(
  areas: Map<string, string>,
  candidates: (string | null | undefined)[]
): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue
    const folded = foldLgu(candidate)
    const slug = areas.get(folded) ?? areas.get(ALIASES[folded] ?? "")
    if (slug) return slug
  }
  return null
}

// ---------------------------------------------------------- photon adapter

/** The subset of Photon's GeoJSON this app reads. Everything is optional. */
type PhotonFeature = {
  geometry?: { coordinates?: unknown }
  properties?: {
    osm_type?: string
    osm_id?: number
    type?: string
    name?: string
    housenumber?: string
    street?: string
    district?: string
    locality?: string
    city?: string
    county?: string
    state?: string
  }
}

/**
 * Photon's coarse layer, mapped to how far the picker should fly. Its verified
 * values are house, street, locality, district, city, county, state and other.
 */
function kindOf(type: string | undefined): PlaceKind {
  switch (type) {
    case "state":
    case "county":
    case "city":
      return "area"
    case "district":
    case "locality":
      return "locality"
    case "street":
      return "street"
    default:
      return "spot"
  }
}

function photonUrl(normalised: string, lang: string): string {
  const params = new URLSearchParams({
    q: normalised,
    limit: String(LIMIT),
    // `lang=tl` is an HTTP 400 from Photon ("Supported are: default, de, en,
    // fr"), so sending it would silently return nothing for every Tagalog
    // reporter. `default` gives the OSM `name` tag, which is the name on the
    // sign and is arguably the better answer here anyway.
    lang: lang === "tl" ? "default" : "en",
    bbox: `${PROVINCE_BBOX.west},${PROVINCE_BBOX.south},${PROVINCE_BBOX.east},${PROVINCE_BBOX.north}`,
    lat: String(PROVINCE_CENTER.lat),
    lon: String(PROVINCE_CENTER.lng),
    location_bias_scale: "0.5",
  })
  return `${BASE_URL}/api/?${params}`
}

async function toPlaces(features: PhotonFeature[]): Promise<PlaceDto[]> {
  const areas = await roster()
  const places: PlaceDto[] = []

  for (const [index, feature] of features.entries()) {
    const p = feature.properties
    const coordinates = feature.geometry?.coordinates
    if (!p || !Array.isArray(coordinates) || coordinates.length < 2) continue

    // Photon is [lon, lat]. This is the single easiest mistake in the file:
    // flipped, Sindalan lands in the Indian Ocean and nothing complains.
    const [lng, lat] = coordinates
    if (typeof lat !== "number" || typeof lng !== "number") continue

    // `name` is last on purpose and is what resolves a town: querying
    // "candaba" answers with city: null, name: "Candaba", type: "city".
    const area = areaSlugFor(areas, [p.city, p.county, p.district, p.name])

    // The bbox above is a relevance bound, not a filter. "macarthur highway
    // mexico" answers with a Guiguinto, BULACAN segment that sits inside the
    // rectangle, and nothing downstream cross-checks a pin against its lguSlug,
    // so without a gate here a reporter can file a Bulacan street under a
    // Pampanga area and the map will happily draw it.
    //
    // The gate is NOT `state === "Pampanga"` alone, and this is the trap. In
    // OSM, Angeles City is a highly urbanized city: it is administratively
    // independent of the province, so its features carry state "Central Luzon"
    // and skip the province level entirely. On that rule alone, searching
    // "balibago angeles" - the busiest part of one of the twenty-two areas -
    // returns nothing at all. Mabalacat and San Fernando are component cities
    // and do say "Pampanga", so this is Angeles specifically, and it is not
    // something a spot check outside Angeles would ever surface.
    //
    // So a feature is in scope if the province names it, or if the geocoder
    // named one of our twenty-two areas. Bulacan's own results are still cut:
    // they say state "Bulacan" and city "Guiguinto", which is on nobody's
    // roster.
    if (p.state !== PROVINCE_NAME && !area) continue

    const label = (
      p.name ?? [p.housenumber, p.street].filter(Boolean).join(" ")
    ).trim()
    // Bounded here rather than discovered as a 422 on a field the reporter
    // never typed in: this label can be dropped straight into locationName,
    // which createReportSchema bounds at min(2).max(160).
    if (label.length < 2) continue

    const context =
      [...new Set([p.district ?? p.locality, p.city ?? p.county, p.state])]
        .filter((part): part is string => Boolean(part) && part !== label)
        .join(", ")
        .slice(0, 160) || null

    places.push({
      id: p.osm_type && p.osm_id ? `${p.osm_type}${p.osm_id}` : `i${index}`,
      label: label.slice(0, 160),
      context,
      lat,
      lng,
      kind: kindOf(p.type),
      area,
    })
  }

  return places
}

// ------------------------------------------------------------------- public

/**
 * Places matching `query`, or the failure arm.
 *
 * The discriminated result is the point: "nothing matched" and "the geocoder is
 * unreachable" need different copy, and a bare empty array cannot tell a
 * reporter which one they are looking at.
 */
export async function searchPlaces(
  query: string,
  lang: string
): Promise<{ ok: true; places: PlaceDto[] } | { ok: false }> {
  // The route enforces three characters on the RAW query, and the prefix strip
  // above can take it back under: "brgy a" is six characters in and one out.
  // Re-checking the normalised form is what keeps a one-letter query from
  // reaching a third party at all.
  const normalised = normalise(query)
  if (normalised.length < MIN_QUERY) return { ok: true, places: [] }

  const key = cacheKey(normalised, lang)
  const cached = readCache(key)
  if (cached) return { ok: true, places: cached }

  try {
    const response = await fetch(photonUrl(normalised, lang), {
      // The bounded cache above is this app's answer. Next's fetch cache keys
      // on the URL, which here is arbitrary user text, and writes on-disk
      // entries it never prunes - the hazard lib/server/queries.ts documents.
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        // The reason this call is proxied at all: a browser cannot set this,
        // and an unattributed flood of requests is how a free service decides
        // to start blocking one.
        "user-agent": "Floodwatch/1.0 (Pampanga Flood Watch)",
        accept: "application/json",
      },
    })
    if (!response.ok) {
      console.error("[geocode] search failed", response.status)
      return { ok: false }
    }

    const body = (await response.json()) as { features?: PhotonFeature[] }
    const places = await toPlaces(body.features ?? [])
    writeCache(key, places)
    return { ok: true, places }
  } catch (error) {
    console.error("[geocode] search failed", error)
    return { ok: false }
  }
}
