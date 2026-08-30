import type { GaugeTrend } from "@/generated/prisma/client"
import { json, notFound, readBody, requireOfficial } from "@/lib/api"
import { prisma } from "@/lib/db"
import { broadcast } from "@/lib/realtime/emit"
import { revalidateGauges } from "@/lib/server/cache"
import { toGauge } from "@/lib/serialize"
import { updateGaugeSchema } from "@/lib/validation"

type Context = { params: Promise<{ id: string }> }

/** Under this the river is reported as holding rather than moving. */
const STEADY_THRESHOLD = 0.02
/** Two observations logged in the same breath would otherwise divide by ~zero. */
const MIN_WINDOW_HOURS = 1 / 60

/** Rate of change against the station's previous observation, in metres per hour. */
function derive(
  previous: { readingMetres: number; observedAt: Date },
  readingMetres: number,
  observedAt: Date
): { trend: GaugeTrend; deltaPerHour: number } {
  const hours =
    (observedAt.getTime() - previous.observedAt.getTime()) / 3_600_000
  const rate =
    (readingMetres - previous.readingMetres) / Math.max(hours, MIN_WINDOW_HOURS)
  const deltaPerHour = Number(rate.toFixed(2))
  if (Math.abs(deltaPerHour) < STEADY_THRESHOLD)
    return { trend: "STEADY", deltaPerHour }
  return { trend: deltaPerHour > 0 ? "RISING" : "FALLING", deltaPerHour }
}

/** How a new observation lands: history first, then the gauge's current state. */
export async function PATCH(request: Request, { params }: Context) {
  const auth = await requireOfficial()
  if (auth.response) return auth.response

  const { id } = await params
  const body = await readBody(request, updateGaugeSchema)
  if (body.response) return body.response
  const input = body.data

  const gauge = await prisma.riverGauge.findUnique({ where: { id } })
  if (!gauge) return notFound("Gauge not found")

  const observedAt = new Date()
  const alarmLevel = input.alarmLevel ?? gauge.alarmLevel
  const derived = derive(gauge, input.readingMetres, observedAt)

  const row = await prisma.$transaction(async (tx) => {
    await tx.gaugeReading.create({
      data: {
        gaugeId: gauge.id,
        readingMetres: input.readingMetres,
        alarmLevel,
        observedAt,
      },
    })
    return tx.riverGauge.update({
      where: { id: gauge.id },
      data: {
        readingMetres: input.readingMetres,
        alarmLevel,
        trend: input.trend ?? derived.trend,
        deltaPerHour: input.deltaPerHour ?? derived.deltaPerHour,
        observedAt,
      },
      include: { lgu: { select: { slug: true } } },
    })
  })

  const dto = toGauge(row)
  revalidateGauges(dto.lguSlug)
  broadcast("gauge:updated", dto, dto.lguSlug)
  return json({ gauge: dto })
}
