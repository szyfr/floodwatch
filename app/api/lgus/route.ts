import { json } from "@/lib/api"
import { listLguSummaries } from "@/lib/server/queries"

/**
 * The area picker shows what each city and municipality is reporting right now,
 * so this is the live rollup rather than the bare list — cached and invalidated
 * with the reports it summarises, not with the areas themselves.
 */
export async function GET() {
  return json({ lgus: await listLguSummaries() })
}
