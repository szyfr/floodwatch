import { NextResponse, type NextRequest } from "next/server"

/**
 * Two cross-cutting rules for the JSON API, applied here so no individual route
 * has to remember them.
 *
 * 1. Session cookies are `SameSite=Lax`, which still rides along on a top-level
 *    cross-site form POST. Every state-changing call must therefore come from
 *    this origin, or a third-party page could sign someone in or out, file a
 *    report, or broadcast on their behalf.
 * 2. Everything under /api is per-viewer and live, so no cache along the way is
 *    allowed to hold on to it.
 */
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"])

function isCrossSite(request: NextRequest): boolean {
  // Modern browsers state it outright.
  const fetchSite = request.headers.get("sec-fetch-site")
  if (fetchSite) return fetchSite !== "same-origin" && fetchSite !== "none"

  // Older ones only send Origin. A missing Origin on an unsafe method is not a
  // browser form post, so it is left to the route's own auth check — that keeps
  // curl and server-to-server calls working.
  const origin = request.headers.get("origin")
  if (!origin) return false
  try {
    return new URL(origin).origin !== new URL(request.url).origin
  } catch {
    return true
  }
}

export function proxy(request: NextRequest) {
  if (UNSAFE.has(request.method) && isCrossSite(request)) {
    return NextResponse.json(
      { error: "Cross-site request rejected", code: "CROSS_SITE" },
      { status: 403 }
    )
  }

  const response = NextResponse.next()
  response.headers.set("cache-control", "private, no-store")
  response.headers.set("vary", "cookie")
  return response
}

export const config = {
  matcher: "/api/:path*",
}
