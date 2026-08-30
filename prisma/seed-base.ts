/**
 * The plumbing both seed entrypoints share: the Prisma client they talk to and
 * the baseline content - the 22 cities and municipalities plus the one account
 * - that every environment needs before anything else can reference it.
 *
 * Idempotent - re-running updates in place rather than duplicating.
 */
import "dotenv/config"

import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"

import { PrismaClient } from "../generated/prisma/client"
import { ADMIN, LGUS } from "./seed-data"

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error("DATABASE_URL is not set")

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
})

/**
 * Lays down the cities and the account, and hands back the ids the demo seed
 * needs to hang its content off.
 */
export async function seedBase() {
  // ---- cities and municipalities -----------------------------------------
  const lguBySlug = new Map<string, string>()
  for (const lgu of LGUS) {
    const row = await prisma.lgu.upsert({
      where: { slug: lgu.slug },
      update: {
        name: lgu.name,
        lat: lgu.lat,
        lng: lgu.lng,
        isCity: lgu.isCity,
        registeredResidents: lgu.registeredResidents,
      },
      create: lgu,
    })
    lguBySlug.set(lgu.slug, row.id)
  }
  console.log(`  ${LGUS.length} cities and municipalities`)

  // ---- the one account -----------------------------------------------------
  // Any other account was made through the app, so the seed leaves it alone.
  const passwordHash = await bcrypt.hash(ADMIN.password, 10)
  const admin = await prisma.user.upsert({
    where: { email: ADMIN.email },
    update: {
      fullName: ADMIN.fullName,
      role: ADMIN.role,
      organisation: ADMIN.organisation ?? null,
      lguId: lguBySlug.get(ADMIN.lguSlug)!,
    },
    create: {
      email: ADMIN.email,
      passwordHash,
      fullName: ADMIN.fullName,
      role: ADMIN.role,
      organisation: ADMIN.organisation ?? null,
      lguId: lguBySlug.get(ADMIN.lguSlug)!,
    },
  })
  console.log(`  1 account: ${ADMIN.email} (${ADMIN.role})`)

  return { lguBySlug, admin }
}
