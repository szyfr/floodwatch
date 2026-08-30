import type { NextRequest } from "next/server"

import { json, readQuery, requireOfficial } from "@/lib/api"
import { listUsers } from "@/lib/server/queries"
import { manageUserQuerySchema } from "@/lib/validation"

/**
 * The officials' accounts console.
 *
 * Under /api/admin rather than /api/auth: nothing here is about the caller's
 * own session, and the OFFICIAL check is what makes reading a province's worth
 * of names and email addresses acceptable at all. The self-service half of the
 * feature - changing your own password - lives at /api/auth/password, where
 * every signed-in resident can reach it.
 */
export async function GET(request: NextRequest) {
  const auth = await requireOfficial()
  if (auth.response) return auth.response

  const query = readQuery(request, manageUserQuerySchema)
  if (query.response) return query.response

  const page = await listUsers(
    {
      q: query.data.q,
      lguSlug: query.data.lgu,
      role: query.data.role,
      order: query.data.order,
      skip: query.data.skip,
      limit: query.data.limit,
    },
    auth.user.id
  )
  return json(page)
}
