import type { NextRequest } from "next/server"

import { json, readQuery, requireOfficial } from "@/lib/api"
import { listAllReports } from "@/lib/server/queries"
import { manageReportQuerySchema } from "@/lib/validation"

/**
 * The officials' report console.
 *
 * Separate from `/api/reports` rather than a flag on it, because the two answer
 * different questions. That one serves the resident map: cached, province-wide
 * or scoped, bounded to the last hour. This one serves a moderation backlog:
 * every report whatever its age, filtered by verification state and free text,
 * paged, and never cached. Gating it on OFFICIAL here means the resident
 * endpoint keeps its unauthenticated read path untouched.
 */
export async function GET(request: NextRequest) {
  const auth = await requireOfficial()
  if (auth.response) return auth.response

  const query = readQuery(request, manageReportQuerySchema)
  if (query.response) return query.response

  const page = await listAllReports(
    {
      q: query.data.q,
      lguSlug: query.data.lgu,
      level: query.data.level,
      status: query.data.status,
      order: query.data.order,
      skip: query.data.skip,
      limit: query.data.limit,
    },
    auth.user.id
  )
  return json(page)
}
