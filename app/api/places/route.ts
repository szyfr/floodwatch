import type { NextRequest } from "next/server"

import { apiError, json, readQuery, requireUser } from "@/lib/api"
import {
  cachedPlaces,
  geocodeEnabled,
  searchPlaces,
} from "@/lib/server/geocode"
import { overLimit } from "@/lib/server/rate-limit"
import { placeQuerySchema } from "@/lib/validation"

/**
 * Place search for the picker maps.
 *
 * Signed in, unlike every other read route here. Those serve this app's own
 * public-by-design database; this one spends a third party's goodwill per call,
 * which makes POST /api/uploads the closer analogue. It costs the submit page
 * nothing, since app/(app)/submit/page.tsx already redirects anonymous
 * visitors, and an account id is a far better limit key than an IP in a
 * province sitting behind carrier-grade NAT. requireOfficial() would be wrong:
 * residents are the reporters.
 */
const PER_USER = 40
const GLOBAL = 300

export async function GET(request: NextRequest) {
  const auth = await requireUser()
  if (auth.response) return auth.response

  const query = readQuery(request, placeQuerySchema)
  if (query.response) return query.response

  if (!geocodeEnabled) {
    return apiError("Place search is off", 503, { code: "GEOCODE_OFF" })
  }

  const { q, lang } = query.data

  if (overLimit(`places:user:${auth.user.id}`, PER_USER)) {
    return apiError("Too many searches", 429, { code: "RATE_LIMIT" })
  }

  // The global ceiling degrades instead of refusing. A 429 here would break
  // search for the whole province during exactly the event this app exists for,
  // so a miss answers with nothing found and leaves the map picker - the path
  // that is always available - carrying the reporter. It is the fail-open
  // argument lib/server/moderation.ts makes, applied one layer out.
  if (overLimit("places:global", GLOBAL)) {
    // Flagged, because an empty list here means "not asked", and the UI must
    // not report that as "no such place".
    return json({ places: cachedPlaces(q, lang) ?? [], degraded: true })
  }

  const result = await searchPlaces(q, lang)
  if (!result.ok) {
    return apiError("Place search is unavailable", 502, {
      code: "GEOCODE_DOWN",
    })
  }
  return json({ places: result.places })
}
