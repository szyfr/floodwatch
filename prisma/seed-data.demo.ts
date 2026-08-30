/**
 * Demo content for local testing — river gauges, flood reports, alerts and
 * safe zones, lifted verbatim from the design prototype
 * (docs/ui-mockups-pending-scope/project/Pampanga Flood Watch.dc.html).
 * `minutesAgo` values are turned into absolute timestamps at seed time so the
 * dashboard's recency filters behave exactly as the mockup shows them.
 *
 * Nothing here is seeded by default. `bun run db:seed` creates only the
 * cities and the one account; `bun run db:seed:demo` adds this on top.
 */

export type SeedGauge = {
  code: string
  lguSlug: string
  name: string
  lat: number
  lng: number
  readingMetres: number
  alarmLevel: "NORMAL" | "FIRST" | "SECOND" | "THIRD"
  trend: "RISING" | "STEADY" | "FALLING"
  deltaPerHour: number
}

export const GAUGES: SeedGauge[] = [
  {
    code: "g1",
    lguSlug: "sanluis",
    name: "Rio Chico · San Luis",
    lat: 15.031,
    lng: 120.795,
    readingMetres: 10.9,
    alarmLevel: "THIRD",
    trend: "RISING",
    deltaPerHour: 0.31,
  },
  {
    code: "g2",
    lguSlug: "apalit",
    name: "Pampanga River · Sulipan, Apalit",
    lat: 14.948,
    lng: 120.763,
    readingMetres: 9.8,
    alarmLevel: "SECOND",
    trend: "RISING",
    deltaPerHour: 0.24,
  },
  {
    code: "g3",
    lguSlug: "arayat",
    name: "Pampanga River · Arayat",
    lat: 15.152,
    lng: 120.774,
    readingMetres: 12.4,
    alarmLevel: "FIRST",
    trend: "RISING",
    deltaPerHour: 0.15,
  },
  {
    code: "g4",
    lguSlug: "masantol",
    name: "Pampanga delta · Masantol",
    lat: 14.881,
    lng: 120.735,
    readingMetres: 4.6,
    alarmLevel: "SECOND",
    trend: "STEADY",
    deltaPerHour: 0.0,
  },
]

export type SeedReport = {
  ref: string
  lguSlug: string
  locationName: string
  waterLevel: "ANKLE" | "KNEE" | "CAR_DEEP" | "IMPASSABLE"
  lat: number
  lng: number
  minutesAgo: number
  upvotes: number
  downvotes: number
  verified: boolean
  hasPhoto: boolean
  description: string
  descriptionTl: string
}

export const REPORTS: SeedReport[] = [
  {
    ref: "r1",
    lguSlug: "candaba",
    locationName: "Vitug crossing, Candaba",
    waterLevel: "IMPASSABLE",
    lat: 15.098,
    lng: 120.826,
    minutesAgo: 4,
    upvotes: 41,
    downvotes: 2,
    verified: true,
    hasPhoto: true,
    description:
      "Chest-deep at the crossing and still rising. Trucks are turning back — do not attempt on a tricycle.",
    descriptionTl:
      "Hanggang dibdib sa crossing at tumataas pa. Bumabalik na ang mga truck — huwag subukan sa tricycle.",
  },
  {
    ref: "r2",
    lguSlug: "sanluis",
    locationName: "San Luis poblacion, Rio Chico bank",
    waterLevel: "IMPASSABLE",
    lat: 15.031,
    lng: 120.795,
    minutesAgo: 6,
    upvotes: 34,
    downvotes: 1,
    verified: true,
    hasPhoto: false,
    description:
      "River is over the bank behind the market. Barangay road is closed to all vehicles.",
    descriptionTl:
      "Umapaw na ang ilog sa likod ng palengke. Sarado sa lahat ng sasakyan ang barangay road.",
  },
  {
    ref: "r3",
    lguSlug: "apalit",
    locationName: "Sulipan riverside, Apalit",
    waterLevel: "IMPASSABLE",
    lat: 14.947,
    lng: 120.762,
    minutesAgo: 7,
    upvotes: 28,
    downvotes: 0,
    verified: true,
    hasPhoto: true,
    description:
      "Water is inside the houses along the dike. Boats are ferrying families to the national high school.",
    descriptionTl:
      "Nasa loob na ng mga bahay sa dike ang tubig. Nagbabangka na papunta sa national high school.",
  },
  {
    ref: "r4",
    lguSlug: "arayat",
    locationName: "San Juan Bano dike road, Arayat",
    waterLevel: "KNEE",
    lat: 15.152,
    lng: 120.772,
    minutesAgo: 9,
    upvotes: 17,
    downvotes: 1,
    verified: false,
    hasPhoto: false,
    description:
      "Knee-deep on the dike road. Passable on foot, slow for tricycles.",
    descriptionTl:
      "Hanggang tuhod sa dike road. Kayang lakarin, mabagal para sa tricycle.",
  },
  {
    ref: "r5",
    lguSlug: "sf",
    locationName: "JASA — Magliman crossing, San Fernando",
    waterLevel: "IMPASSABLE",
    lat: 15.0268,
    lng: 120.6702,
    minutesAgo: 4,
    upvotes: 31,
    downvotes: 2,
    verified: true,
    hasPhoto: true,
    description:
      "Chest-deep under the crossing and still rising. Trucks are turning back at the corner.",
    descriptionTl:
      "Hanggang dibdib sa ilalim ng crossing at tumataas pa. Bumabalik ang mga truck sa kanto.",
  },
  {
    ref: "r6",
    lguSlug: "sf",
    locationName: "Magliman Elementary School gate",
    waterLevel: "KNEE",
    lat: 15.0301,
    lng: 120.6669,
    minutesAgo: 8,
    upvotes: 14,
    downvotes: 1,
    verified: false,
    hasPhoto: false,
    description:
      "Water reached the school gate. Tricycles can still pass but slowly. Covered court inside is dry.",
    descriptionTl:
      "Umabot sa gate ng eskwelahan ang tubig. Kaya pa ng tricycle pero mabagal. Tuyo pa ang covered court.",
  },
  {
    ref: "r7",
    lguSlug: "masantol",
    locationName: "Sagrada, Masantol",
    waterLevel: "IMPASSABLE",
    lat: 14.881,
    lng: 120.731,
    minutesAgo: 12,
    upvotes: 26,
    downvotes: 0,
    verified: true,
    hasPhoto: false,
    description:
      "Tidal backflow on top of the river rise. Only bancas are moving through the poblacion.",
    descriptionTl:
      "Sabay ang taog at pagtaas ng ilog. Bangka na lang ang nakakadaan sa poblacion.",
  },
  {
    ref: "r8",
    lguSlug: "candaba",
    locationName: "Candaba viaduct service road",
    waterLevel: "CAR_DEEP",
    lat: 15.086,
    lng: 120.812,
    minutesAgo: 11,
    upvotes: 22,
    downvotes: 3,
    verified: false,
    hasPhoto: true,
    description:
      "Sedans are stalling near the bend. Only high vehicles are getting through.",
    descriptionTl:
      "Nag-i-stall ang mga sedan sa may liko. Matataas na sasakyan lang ang nakakadaan.",
  },
  {
    ref: "r9",
    lguSlug: "santaana",
    locationName: "Santa Ana — San Nicolas road",
    waterLevel: "CAR_DEEP",
    lat: 15.092,
    lng: 120.764,
    minutesAgo: 14,
    upvotes: 19,
    downvotes: 2,
    verified: false,
    hasPhoto: true,
    description:
      "Half a metre across the whole stretch. Jeepneys are rerouting through the market.",
    descriptionTl:
      "Kalahating metro sa buong bahagi. Dumadaan na sa palengke ang mga jeep.",
  },
  {
    ref: "r10",
    lguSlug: "macabebe",
    locationName: "Macabebe — Masantol road",
    waterLevel: "CAR_DEEP",
    lat: 14.898,
    lng: 120.719,
    minutesAgo: 16,
    upvotes: 21,
    downvotes: 1,
    verified: true,
    hasPhoto: false,
    description:
      "Deep enough to stall a car at the low section near the bridge approach.",
    descriptionTl:
      "Sapat ang lalim para mag-stall ang kotse sa mababang bahagi bago ang tulay.",
  },
  {
    ref: "r11",
    lguSlug: "sf",
    locationName: "Dolores interchange underpass",
    waterLevel: "CAR_DEEP",
    lat: 15.039,
    lng: 120.678,
    minutesAgo: 17,
    upvotes: 15,
    downvotes: 4,
    verified: false,
    hasPhoto: false,
    description:
      "Underpass is filling again. Traffic is being waved up to the flyover.",
    descriptionTl:
      "Napupuno na muli ang underpass. Pinapaakyat ang traffic sa flyover.",
  },
  {
    ref: "r12",
    lguSlug: "apalit",
    locationName: "MacArthur Highway, San Vicente",
    waterLevel: "KNEE",
    lat: 14.952,
    lng: 120.755,
    minutesAgo: 19,
    upvotes: 12,
    downvotes: 0,
    verified: false,
    hasPhoto: false,
    description:
      "One southbound lane is under water. Buses are still passing on the inner lane.",
    descriptionTl:
      "Lubog ang isang southbound lane. Dumadaan pa ang mga bus sa loob na lane.",
  },
  {
    ref: "r13",
    lguSlug: "sansimon",
    locationName: "San Simon town proper",
    waterLevel: "KNEE",
    lat: 14.966,
    lng: 120.781,
    minutesAgo: 22,
    upvotes: 9,
    downvotes: 1,
    verified: false,
    hasPhoto: false,
    description: "Knee-deep around the church and the covered court.",
    descriptionTl: "Hanggang tuhod sa paligid ng simbahan at covered court.",
  },
  {
    ref: "r14",
    lguSlug: "guagua",
    locationName: "Guagua public market",
    waterLevel: "KNEE",
    lat: 14.966,
    lng: 120.634,
    minutesAgo: 24,
    upvotes: 11,
    downvotes: 0,
    verified: true,
    hasPhoto: false,
    description:
      "Stalls on the low side are packing up. Water is not draining yet.",
    descriptionTl:
      "Nag-iimpake na ang mga tindahan sa mababang bahagi. Hindi pa lumalabas ang tubig.",
  },
  {
    ref: "r15",
    lguSlug: "arayat",
    locationName: "Arayat public market",
    waterLevel: "ANKLE",
    lat: 15.146,
    lng: 120.766,
    minutesAgo: 26,
    upvotes: 8,
    downvotes: 0,
    verified: false,
    hasPhoto: false,
    description: "Shallow but spreading toward the houses on the low side.",
    descriptionTl:
      "Mababaw pa pero kumakalat papunta sa mga bahay sa mababang bahagi.",
  },
  {
    ref: "r16",
    lguSlug: "minalin",
    locationName: "Minalin fish port road",
    waterLevel: "KNEE",
    lat: 14.971,
    lng: 120.688,
    minutesAgo: 31,
    upvotes: 7,
    downvotes: 0,
    verified: false,
    hasPhoto: false,
    description:
      "Water over the road at high tide. Clears for about two hours after.",
    descriptionTl:
      "Lubog ang kalsada kapag taog. Lumilinaw mga dalawang oras pagkatapos.",
  },
  {
    ref: "r17",
    lguSlug: "bacolor",
    locationName: "Cabambangan, Bacolor",
    waterLevel: "ANKLE",
    lat: 15.002,
    lng: 120.651,
    minutesAgo: 38,
    upvotes: 5,
    downvotes: 1,
    verified: false,
    hasPhoto: false,
    description: "Ankle-deep along the lahar channel road. Draining slowly.",
    descriptionTl:
      "Hanggang bukung-bukong sa tabi ng lahar channel. Mabagal ang paglabas.",
  },
  {
    ref: "r18",
    lguSlug: "mexico",
    locationName: "Mexico — Santo Tomas road",
    waterLevel: "ANKLE",
    lat: 15.062,
    lng: 120.712,
    minutesAgo: 44,
    upvotes: 4,
    downvotes: 0,
    verified: false,
    hasPhoto: false,
    description: "Pooling on the shoulder, passable at normal speed.",
    descriptionTl: "May tubig sa gilid, madadaanan sa normal na bilis.",
  },
]

export type SeedAlert = {
  ref: string
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  type: "FLOOD_WARNING" | "EVACUATION_ORDER" | "ROAD_CLOSURE" | "GENERAL"
  minutesAgo: number
  sentBy: string
  /** "PROVINCE" or a list of LGU slugs. */
  areas: "PROVINCE" | string[]
  title: string
  titleTl: string
  message: string
  messageTl: string
}

export const ALERTS: SeedAlert[] = [
  {
    ref: "a1",
    priority: "CRITICAL",
    type: "EVACUATION_ORDER",
    minutesAgo: 2,
    sentBy: "Flood Watch operations",
    areas: ["candaba", "sanluis", "arayat"],
    title:
      "Evacuation ordered — riverside barangays of Candaba, San Luis and Arayat",
    titleTl:
      "Utos na lumikas — mga barangay sa tabing-ilog ng Candaba, San Luis at Arayat",
    message:
      "Rio Chico is at third alarm and still rising. Proceed to the nearest evacuation centre now. Provincial rescue teams are staging at the Candaba municipal hall.",
    messageTl:
      "Third alarm na ang Rio Chico at tumataas pa. Pumunta na sa pinakamalapit na evacuation centre. Naka-istambay ang provincial rescue sa municipal hall ng Candaba.",
  },
  {
    ref: "a2",
    priority: "HIGH",
    type: "FLOOD_WARNING",
    minutesAgo: 26,
    sentBy: "Flood Watch operations",
    areas: "PROVINCE",
    title: "Pampanga River at second alarm in Apalit",
    titleTl: "Pampanga River sa second alarm sa Apalit",
    message:
      "PAGASA raised the second alarm at 3:40 PM. Households along the river in the fourth district should move valuables to the second floor now.",
    messageTl:
      "Itinaas ng PAGASA ang second alarm ganap na 3:40 PM. Ang mga bahay sa tabi ng ilog sa fourth district ay dapat nang iakyat ang gamit sa itaas.",
  },
  {
    ref: "a3",
    priority: "MEDIUM",
    type: "ROAD_CLOSURE",
    minutesAgo: 64,
    sentBy: "Flood Watch Macabebe",
    areas: ["macabebe", "masantol"],
    title: "Macabebe — Masantol road closed to light vehicles",
    titleTl: "Sarado sa magagaang sasakyan ang Macabebe — Masantol road",
    message:
      "Use the Apalit — San Simon route instead. Tanods are posted at both ends of the closure.",
    messageTl:
      "Gamitin muna ang Apalit — San Simon na ruta. May tanod sa dalawang dulo ng saradong bahagi.",
  },
  {
    ref: "a4",
    priority: "LOW",
    type: "GENERAL",
    minutesAgo: 184,
    sentBy: "Flood Watch relief desk",
    areas: "PROVINCE",
    title: "Relief goods staging at the Capitol from 7:00 AM",
    titleTl: "Relief goods sa Capitol simula 7:00 AM",
    message:
      "Municipal claim slips only. Coordinate through your local relief desk, not directly at the Capitol gate.",
    messageTl:
      "Municipal claim slip lang ang tatanggapin. Dumaan sa lokal na relief desk, hindi sa gate ng Capitol.",
  },
]

export type SeedZone = {
  ref: string
  lguSlug: string
  name: string
  type: "SHELTER" | "EVACUATION_POINT" | "HIGH_GROUND"
  lat: number
  lng: number
  capacity: number | null
  occupancy: number
  contactName: string
  contactPhone: string
}

export const ZONES: SeedZone[] = [
  {
    ref: "z1",
    lguSlug: "candaba",
    name: "Candaba Central School",
    type: "SHELTER",
    lat: 15.096,
    lng: 120.828,
    capacity: 900,
    occupancy: 640,
    contactName: "Candaba shelter desk",
    contactPhone: "0917 402 1188",
  },
  {
    ref: "z2",
    lguSlug: "sanluis",
    name: "San Luis Municipal Gymnasium",
    type: "EVACUATION_POINT",
    lat: 15.033,
    lng: 120.792,
    capacity: 500,
    occupancy: 480,
    contactName: "San Luis evacuation desk",
    contactPhone: "0995 118 4402",
  },
  {
    ref: "z3",
    lguSlug: "apalit",
    name: "Apalit National High School",
    type: "SHELTER",
    lat: 14.951,
    lng: 120.757,
    capacity: 1200,
    occupancy: 810,
    contactName: "Apalit shelter desk",
    contactPhone: "0917 330 7712",
  },
  {
    ref: "z4",
    lguSlug: "masantol",
    name: "Masantol Sports Complex",
    type: "SHELTER",
    lat: 14.884,
    lng: 120.733,
    capacity: 700,
    occupancy: 690,
    contactName: "Masantol shelter desk",
    contactPhone: "0906 224 8130",
  },
  {
    ref: "z5",
    lguSlug: "sf",
    name: "Magliman Elementary School Covered Court",
    type: "SHELTER",
    lat: 15.0303,
    lng: 120.6664,
    capacity: 320,
    occupancy: 150,
    contactName: "Kgd. Elmer Bengco",
    contactPhone: "0917 412 8830",
  },
  {
    ref: "z6",
    lguSlug: "arayat",
    name: "Arayat Municipal Hall grounds",
    type: "EVACUATION_POINT",
    lat: 15.15,
    lng: 120.769,
    capacity: 400,
    occupancy: 120,
    contactName: "Arayat evacuation desk",
    contactPhone: "0908 771 2245",
  },
  {
    ref: "z7",
    lguSlug: "bacolor",
    name: "PASUDECO embankment, Bacolor",
    type: "HIGH_GROUND",
    lat: 15.0,
    lng: 120.65,
    capacity: null,
    occupancy: 0,
    contactName: "",
    contactPhone: "",
  },
]
