/**
 * Lays the demo content on top of the baseline seed: 4 river gauges with six
 * hours of readings, 7 safe zones, 18 flood reports and 4 broadcast alerts,
 * exactly as the design bundle mocks them up.
 *
 * Local testing only — `bun run db:seed:demo`. The default `db:seed` (and the
 * seed `prisma migrate reset` runs) creates just the cities and the account.
 *
 * Re-running replaces the demo content wholesale rather than duplicating it;
 * reports, alerts and safe zones made through the app are wiped along with it.
 */
import { prisma, seedBase } from "./seed-base"
import { ALERTS, GAUGES, REPORTS, ZONES } from "./seed-data.demo"

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

async function main() {
  console.log("seeding Pampanga Flood Watch with demo content…")

  const { lguBySlug, admin } = await seedBase()

  // ---- river gauges --------------------------------------------------------
  for (const gauge of GAUGES) {
    const row = await prisma.riverGauge.upsert({
      where: { code: gauge.code },
      update: {
        name: gauge.name,
        lat: gauge.lat,
        lng: gauge.lng,
        readingMetres: gauge.readingMetres,
        alarmLevel: gauge.alarmLevel,
        trend: gauge.trend,
        deltaPerHour: gauge.deltaPerHour,
        observedAt: new Date(),
        lguId: lguBySlug.get(gauge.lguSlug)!,
      },
      create: {
        code: gauge.code,
        name: gauge.name,
        lat: gauge.lat,
        lng: gauge.lng,
        readingMetres: gauge.readingMetres,
        alarmLevel: gauge.alarmLevel,
        trend: gauge.trend,
        deltaPerHour: gauge.deltaPerHour,
        lguId: lguBySlug.get(gauge.lguSlug)!,
      },
    })

    // Six hours of history, walked backwards from the current reading so the
    // trend line the gauge asserts is actually supported by observations.
    await prisma.gaugeReading.deleteMany({ where: { gaugeId: row.id } })
    const step =
      gauge.trend === "RISING"
        ? gauge.deltaPerHour
        : gauge.trend === "FALLING"
          ? -gauge.deltaPerHour
          : 0
    await prisma.gaugeReading.createMany({
      data: Array.from({ length: 6 }, (_, i) => ({
        gaugeId: row.id,
        readingMetres: Number(
          (gauge.readingMetres - step * (i + 1)).toFixed(2)
        ),
        alarmLevel: gauge.alarmLevel,
        observedAt: minutesAgo((i + 1) * 60),
      })),
    })
  }
  console.log(`  ${GAUGES.length} river gauges with 6h of readings`)

  // ---- safe zones ----------------------------------------------------------
  await prisma.safeZone.deleteMany({})
  for (const zone of ZONES) {
    await prisma.safeZone.create({
      data: {
        lguId: lguBySlug.get(zone.lguSlug)!,
        name: zone.name,
        type: zone.type,
        lat: zone.lat,
        lng: zone.lng,
        capacity: zone.capacity,
        occupancy: zone.occupancy,
        contactName: zone.contactName || null,
        contactPhone: zone.contactPhone || null,
        createdById: admin.id,
      },
    })
  }
  console.log(`  ${ZONES.length} safe zones`)

  // ---- reports -------------------------------------------------------------
  await prisma.reportVote.deleteMany({})
  await prisma.floodReport.deleteMany({})

  for (const report of REPORTS) {
    const createdAt = minutesAgo(report.minutesAgo)
    await prisma.floodReport.create({
      data: {
        lguId: lguBySlug.get(report.lguSlug)!,
        locationName: report.locationName,
        description: report.description,
        descriptionTl: report.descriptionTl,
        waterLevel: report.waterLevel,
        lat: report.lat,
        lng: report.lng,
        photoUrl: report.hasPhoto ? "/sample-report-photo.svg" : null,
        upvotes: report.upvotes,
        downvotes: report.downvotes,
        verifiedAt: report.verified ? createdAt : null,
        verifiedById: report.verified ? admin.id : null,
        // Seeded reports are synthetic, so they carry no reporter — the UI
        // renders them as "Anonymous", a state the design already covers.
        authorId: null,
        createdAt,
        updatedAt: createdAt,
      },
    })
  }
  console.log(`  ${REPORTS.length} flood reports`)

  // ---- alerts --------------------------------------------------------------
  await prisma.alertDismissal.deleteMany({})
  await prisma.alertArea.deleteMany({})
  await prisma.alert.deleteMany({})
  for (const alert of ALERTS) {
    const createdAt = minutesAgo(alert.minutesAgo)
    await prisma.alert.create({
      data: {
        title: alert.title,
        titleTl: alert.titleTl,
        message: alert.message,
        messageTl: alert.messageTl,
        type: alert.type,
        priority: alert.priority,
        scope: alert.areas === "PROVINCE" ? "PROVINCE" : "AREAS",
        sentBy: alert.sentBy,
        authorId: admin.id,
        createdAt,
        updatedAt: createdAt,
        areas:
          alert.areas === "PROVINCE"
            ? undefined
            : {
                create: alert.areas.map((slug) => ({
                  lguId: lguBySlug.get(slug)!,
                })),
              },
      },
    })
  }
  console.log(`  ${ALERTS.length} alerts`)

  console.log("done.")
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
