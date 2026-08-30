/**
 * Baseline seed content: the 22 cities and municipalities of Pampanga and the
 * one account behind them. Lifted verbatim from the design prototype
 * (docs/ui-mockups-pending-scope/project/Pampanga Flood Watch.dc.html).
 *
 * Sample reports, gauges, alerts and safe zones live in `seed-data.demo.ts`
 * and are only loaded by `bun run db:seed:demo`.
 */

export type SeedLgu = {
  slug: string
  name: string
  lat: number
  lng: number
  registeredResidents: number
  isCity: boolean
}

export const LGUS: SeedLgu[] = [
  {
    slug: "angeles",
    name: "Angeles City",
    lat: 15.145,
    lng: 120.5887,
    registeredResidents: 62400,
    isCity: true,
  },
  {
    slug: "sf",
    name: "City of San Fernando",
    lat: 15.0349,
    lng: 120.6899,
    registeredResidents: 51800,
    isCity: true,
  },
  {
    slug: "mabalacat",
    name: "Mabalacat City",
    lat: 15.2216,
    lng: 120.572,
    registeredResidents: 40200,
    isCity: true,
  },
  {
    slug: "apalit",
    name: "Apalit",
    lat: 14.9496,
    lng: 120.7587,
    registeredResidents: 17600,
    isCity: false,
  },
  {
    slug: "arayat",
    name: "Arayat",
    lat: 15.1493,
    lng: 120.7692,
    registeredResidents: 21300,
    isCity: false,
  },
  {
    slug: "bacolor",
    name: "Bacolor",
    lat: 15.0,
    lng: 120.65,
    registeredResidents: 14900,
    isCity: false,
  },
  {
    slug: "candaba",
    name: "Candaba",
    lat: 15.095,
    lng: 120.828,
    registeredResidents: 16800,
    isCity: false,
  },
  {
    slug: "floridablanca",
    name: "Floridablanca",
    lat: 14.97,
    lng: 120.533,
    registeredResidents: 18600,
    isCity: false,
  },
  {
    slug: "guagua",
    name: "Guagua",
    lat: 14.9667,
    lng: 120.6333,
    registeredResidents: 18100,
    isCity: false,
  },
  {
    slug: "lubao",
    name: "Lubao",
    lat: 14.94,
    lng: 120.6,
    registeredResidents: 24300,
    isCity: false,
  },
  {
    slug: "macabebe",
    name: "Macabebe",
    lat: 14.9,
    lng: 120.7167,
    registeredResidents: 11400,
    isCity: false,
  },
  {
    slug: "magalang",
    name: "Magalang",
    lat: 15.213,
    lng: 120.664,
    registeredResidents: 16200,
    isCity: false,
  },
  {
    slug: "masantol",
    name: "Masantol",
    lat: 14.883,
    lng: 120.733,
    registeredResidents: 8600,
    isCity: false,
  },
  {
    slug: "mexico",
    name: "Mexico",
    lat: 15.0667,
    lng: 120.7167,
    registeredResidents: 22600,
    isCity: false,
  },
  {
    slug: "minalin",
    name: "Minalin",
    lat: 14.97,
    lng: 120.69,
    registeredResidents: 7300,
    isCity: false,
  },
  {
    slug: "porac",
    name: "Porac",
    lat: 15.072,
    lng: 120.542,
    registeredResidents: 19800,
    isCity: false,
  },
  {
    slug: "sanluis",
    name: "San Luis",
    lat: 15.033,
    lng: 120.792,
    registeredResidents: 8500,
    isCity: false,
  },
  {
    slug: "sansimon",
    name: "San Simon",
    lat: 14.967,
    lng: 120.783,
    registeredResidents: 8800,
    isCity: false,
  },
  {
    slug: "santaana",
    name: "Santa Ana",
    lat: 15.0939,
    lng: 120.7681,
    registeredResidents: 8700,
    isCity: false,
  },
  {
    slug: "santarita",
    name: "Santa Rita",
    lat: 14.95,
    lng: 120.617,
    registeredResidents: 6300,
    isCity: false,
  },
  {
    slug: "santotomas",
    name: "Santo Tomas",
    lat: 15.0,
    lng: 120.717,
    registeredResidents: 6200,
    isCity: false,
  },
  {
    slug: "sasmuan",
    name: "Sasmuan",
    lat: 14.936,
    lng: 120.623,
    registeredResidents: 4300,
    isCity: false,
  },
]

export type SeedUser = {
  email: string
  fullName: string
  role: "RESIDENT" | "OFFICIAL"
  lguSlug: string
  password: string
  organisation?: string
}

/**
 * The only seeded account. Override the password with SEED_ADMIN_PASSWORD
 * before running this anywhere that is not a development machine.
 */
export const ADMIN: SeedUser = {
  email: "dev@renmendoza.com",
  fullName: "Ren Mendoza",
  role: "OFFICIAL",
  lguSlug: "sf",
  password: process.env.SEED_ADMIN_PASSWORD ?? "floodwatch",
  organisation: "Flood Watch operations",
}
