import type { NextRequest } from "next/server"

import { json, readQuery } from "@/lib/api"
import { listGauges } from "@/lib/server/queries"
import { reportQuerySchema } from "@/lib/validation"

const scopeQuery = reportQuerySchema.pick({ lgu: true })

export async function GET(request: NextRequest) {
  const query = readQuery(request, scopeQuery)
  if (query.response) return query.response

  const gauges = await listGauges(query.data.lgu ?? null)
  return json({ gauges })
}
