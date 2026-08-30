/**
 * Seeds the baseline every environment needs: the 22 cities and municipalities
 * of Pampanga and the account behind them. Nothing else - reports, gauges,
 * alerts and safe zones are demo content, and `bun run db:seed:demo` lays them
 * on top of this for local testing.
 *
 * Idempotent - re-running updates in place rather than duplicating.
 */
import { prisma, seedBase } from "./seed-base"

async function main() {
  console.log("seeding Pampanga Flood Watch…")
  await seedBase()
  console.log("done.")
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
