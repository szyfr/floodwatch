import type { NextRequest } from "next/server"

import { json, readQuery } from "@/lib/api"
import { getSessionUser } from "@/lib/auth/session"
import { getDashboard } from "@/lib/server/queries"
import { reportQuerySchema } from "@/lib/validation"

export async function GET(request: NextRequest) {
  const query = readQuery(request, reportQuerySchema)
  if (query.response) return query.response

  const viewer = await getSessionUser()
  const dashboard = await getDashboard(
    {
      lguSlug: query.data.lgu,
      level: query.data.level,
      recency: query.data.recency,
      sort: query.data.sort,
      limit: query.data.limit,
    },
    viewer?.id ?? null
  )
  return json(dashboard)
}
