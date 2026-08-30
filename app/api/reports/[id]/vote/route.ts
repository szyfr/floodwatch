import type { NextRequest } from "next/server"

import { json, notFound, readBody, requireUser } from "@/lib/api"
import { prisma } from "@/lib/db"
import type { VoteValue } from "@/lib/dto"
import { broadcast } from "@/lib/realtime/emit"
import { revalidateReportVotes } from "@/lib/server/cache"
import { getReport } from "@/lib/server/queries"
import { voteSchema } from "@/lib/validation"

type Context = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Context) {
  const { id } = await params

  const auth = await requireUser()
  if (auth.response) return auth.response

  const body = await readBody(request, voteSchema)
  if (body.response) return body.response
  const wanted = body.data.value

  const userId = auth.user.id
  const key = { reportId_userId: { reportId: id, userId } }

  // Read, write and counter update share one transaction, and the counters move
  // by a delta derived from the vote that was actually there - so two votes
  // landing at once cannot leave upvotes/downvotes out of step with the rows.
  const lguSlug = await prisma.$transaction(async (tx) => {
    const report = await tx.floodReport.findFirst({
      where: { id, deletedAt: null },
      select: { lgu: { select: { slug: true } } },
    })
    if (!report) return null

    const current = await tx.reportVote.findUnique({
      where: key,
      select: { value: true },
    })
    const previous = (current?.value as VoteValue | undefined) ?? null
    // Tapping the same arrow again clears the vote; the other arrow switches it.
    const next = wanted !== null && wanted === previous ? null : wanted

    if (next !== previous) {
      // Idempotent writes, not read-then-branch: two taps racing each other
      // would otherwise collide on the unique index or delete a row that is
      // already gone, and answer 500.
      if (next === null) {
        await tx.reportVote.deleteMany({ where: { reportId: id, userId } })
      } else {
        await tx.reportVote.upsert({
          where: key,
          create: { reportId: id, userId, value: next },
          update: { value: next },
        })
      }

      await tx.floodReport.update({
        where: { id },
        data: {
          upvotes: {
            increment: (next === "UP" ? 1 : 0) - (previous === "UP" ? 1 : 0),
          },
          downvotes: {
            increment:
              (next === "DOWN" ? 1 : 0) - (previous === "DOWN" ? 1 : 0),
          },
        },
      })
    }

    return report.lgu.slug
  })

  if (!lguSlug) return notFound("Report not found")

  const report = await getReport(id, userId)
  if (!report) return notFound("Report not found")

  // Only the report lists: a vote cannot move the per-area rollup.
  revalidateReportVotes(lguSlug)
  broadcast(
    "report:voted",
    {
      id: report.id,
      lguSlug,
      upvotes: report.upvotes,
      downvotes: report.downvotes,
    },
    lguSlug
  )

  return json({ report })
}
