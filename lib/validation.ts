/** Request validation for every mutating endpoint. */
import { z } from "zod"

import {
  ALARM_LEVELS,
  ALERT_PRIORITIES,
  ALERT_TYPES,
  DESCRIPTION_MAX,
  RECENCY_OPTIONS,
  SORT_OPTIONS,
  WATER_LEVELS,
  ZONE_TYPES,
} from "@/lib/domain"

const lat = z.coerce.number().min(-90).max(90)
const lng = z.coerce.number().min(-180).max(180)
const slug = z
  .string()
  .trim()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9-]+$/, "Invalid area id")

// zod v4 runs transforms after validation, so the trim has to come first or a
// pasted address with a trailing space is rejected instead of cleaned up.
const emailField = z.string().trim().toLowerCase().pipe(z.email("errEmail"))

// Photos must be ours: a same-origin path, no scheme, no protocol-relative
// host, no traversal. Otherwise the upload endpoint's type and magic-byte
// checks could be bypassed by posting an arbitrary URL, and every viewer's
// browser would fetch it.
const photoUrlField = z
  .string()
  .trim()
  .max(500)
  .regex(/^\/(?!\/)[\w./-]*$/, "photo")
  .refine((v) => !v.includes(".."), { message: "photo" })

export const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2, "errName").max(120),
    email: emailField,
    password: z.string().min(8, "errPass").max(200),
    confirmPassword: z.string(),
    lguSlug: slug,
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "errConfirm",
    path: ["confirmPassword"],
  })

export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, "errPass"),
})

export const createReportSchema = z.object({
  lguSlug: slug,
  locationName: z.string().trim().min(2, "name").max(160),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX)
    .optional()
    .or(z.literal("")),
  waterLevel: z.enum(WATER_LEVELS),
  lat,
  lng,
  photoUrl: photoUrlField.optional().nullable(),
  /** Client-supplied id so a queued offline report is not sent twice. */
  clientId: z.string().trim().max(64).optional(),
})

export const updateReportSchema = z
  .object({
    /** The submit screen keeps the area picker live when editing. */
    lguSlug: slug.optional(),
    locationName: z.string().trim().min(2, "name").max(160).optional(),
    description: z.string().trim().max(DESCRIPTION_MAX).nullable().optional(),
    waterLevel: z.enum(WATER_LEVELS).optional(),
    lat: lat.optional(),
    lng: lng.optional(),
    photoUrl: photoUrlField.nullable().optional(),
    /** Officials only. */
    verified: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" })

export const voteSchema = z.object({
  /** null clears the viewer's vote. */
  value: z.enum(["UP", "DOWN"]).nullable(),
})

export const reportQuerySchema = z.object({
  lgu: slug.optional(),
  level: z.enum(WATER_LEVELS).optional(),
  recency: z.enum(RECENCY_OPTIONS).default("60"),
  sort: z.enum(SORT_OPTIONS).default("recent"),
  limit: z.coerce.number().int().min(1).max(200).default(100),
})

export const createAlertSchema = z
  .object({
    title: z.string().trim().min(3, "errTitle").max(200),
    titleTl: z.string().trim().max(200).optional().nullable(),
    message: z.string().trim().max(DESCRIPTION_MAX).default(""),
    messageTl: z.string().trim().max(DESCRIPTION_MAX).optional().nullable(),
    type: z.enum(ALERT_TYPES),
    priority: z.enum(ALERT_PRIORITIES),
    scope: z.enum(["PROVINCE", "AREAS"]),
    areas: z.array(slug).default([]),
    expiresAt: z.iso.datetime().optional().nullable(),
  })
  .refine((v) => v.scope === "PROVINCE" || v.areas.length > 0, {
    message: "errAreas",
    path: ["areas"],
  })

export const createZoneSchema = z.object({
  lguSlug: slug,
  name: z.string().trim().min(2).max(160),
  type: z.enum(ZONE_TYPES),
  lat,
  lng,
  capacity: z.coerce.number().int().min(0).max(100000).nullable().optional(),
  occupancy: z.coerce.number().int().min(0).max(100000).default(0),
  contactName: z.string().trim().max(120).optional().nullable(),
  contactPhone: z.string().trim().max(40).optional().nullable(),
})

// Declared field by field rather than `createZoneSchema.partial()`: that would
// inherit `occupancy`'s `.default(0)`, so any edit omitting occupancy would
// silently empty the centre.
export const updateZoneSchema = z
  .object({
    lguSlug: slug.optional(),
    name: z.string().trim().min(2).max(160).optional(),
    type: z.enum(ZONE_TYPES).optional(),
    lat: lat.optional(),
    lng: lng.optional(),
    capacity: z.coerce.number().int().min(0).max(100000).nullable().optional(),
    occupancy: z.coerce.number().int().min(0).max(100000).optional(),
    contactName: z.string().trim().max(120).optional().nullable(),
    contactPhone: z.string().trim().max(40).optional().nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" })

export const updateGaugeSchema = z.object({
  readingMetres: z.coerce.number().min(-10).max(100),
  alarmLevel: z.enum(ALARM_LEVELS).optional(),
  trend: z.enum(["RISING", "STEADY", "FALLING"]).optional(),
  deltaPerHour: z.coerce.number().min(-50).max(50).optional(),
})

export const languageSchema = z.object({
  language: z.enum(["en", "tl"], { error: "errLanguage" }),
})

export type SignUpInput = z.infer<typeof signUpSchema>
export type SignInInput = z.infer<typeof signInSchema>
export type CreateReportInput = z.infer<typeof createReportSchema>
export type UpdateReportInput = z.infer<typeof updateReportSchema>
export type CreateAlertInput = z.infer<typeof createAlertSchema>
export type CreateZoneInput = z.infer<typeof createZoneSchema>
export type ReportQuery = z.infer<typeof reportQuerySchema>

/** Flattens a ZodError into the `{ field: messageKey }` the forms expect. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form"
    if (!(key in out)) out[key] = issue.message
  }
  return out
}
