import type { NextRequest } from "next/server"

import { json, readQuery } from "@/lib/api"
import { prisma } from "@/lib/db"
import { reportQuerySchema } from "@/lib/validation"

const scopeQuery = reportQuerySchema.pick({ lgu: true })

/**
 * Route drawing is phase 2 in the design — the admin tab shows a disabled empty
 * state — so this reads the table that exists and returns nothing today.
 */
export type RouteDto = {
  id: string
  lguId: string
  lguSlug: string
  lguName: string
  name: string
  /** GeoJSON LineString coordinates: [[lng, lat], …] */
  path: number[][]
}

export async function GET(request: NextRequest) {
  const query = readQuery(request, scopeQuery)
  if (query.response) return query.response

  const rows = await prisma.evacuationRoute.findMany({
    where: {
      deletedAt: null,
      ...(query.data.lgu ? { lgu: { slug: query.data.lgu } } : {}),
    },
    include: { lgu: { select: { slug: true, name: true } } },
    orderBy: { name: "asc" },
  })

  const routes: RouteDto[] = rows.map((row) => ({
    id: row.id,
    lguId: row.lguId,
    lguSlug: row.lgu.slug,
    lguName: row.lgu.name,
    name: row.name,
    path: Array.isArray(row.path) ? (row.path as number[][]) : [],
  }))
  return json({ routes })
}
