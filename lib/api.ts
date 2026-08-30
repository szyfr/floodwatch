import "server-only"

import { NextResponse } from "next/server"
import type { ZodError, ZodType } from "zod"

import { getSessionUser } from "@/lib/auth/session"
import type { ApiError, SessionUserDto } from "@/lib/dto"
import { fieldErrors } from "@/lib/validation"

export function json<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init)
}

export function apiError(
  message: string,
  status: number,
  extra?: Omit<ApiError, "error">
): NextResponse<ApiError> {
  return NextResponse.json({ error: message, ...extra }, { status })
}

export const unauthorized = () =>
  apiError("Sign in to continue", 401, { code: "UNAUTHORIZED" })
export const forbidden = () =>
  apiError("You do not have access to this", 403, { code: "FORBIDDEN" })
export const notFound = (what = "Not found") =>
  apiError(what, 404, { code: "NOT_FOUND" })

export function invalid(error: ZodError): NextResponse<ApiError> {
  return apiError("That did not validate", 422, {
    code: "INVALID",
    fields: fieldErrors(error),
  })
}

/** Parses a JSON body against a schema; returns either data or a 4xx response. */
export async function readBody<T>(
  request: Request,
  schema: ZodType<T>
): Promise<
  | { data: T; response?: never }
  | { data?: never; response: NextResponse<ApiError> }
> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return {
      response: apiError("Expected a JSON body", 400, { code: "BAD_JSON" }),
    }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { response: invalid(parsed.error) }
  return { data: parsed.data }
}

export function readQuery<T>(
  request: Request,
  schema: ZodType<T>
):
  | { data: T; response?: never }
  | { data?: never; response: NextResponse<ApiError> } {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries())
  const parsed = schema.safeParse(params)
  if (!parsed.success) return { response: invalid(parsed.error) }
  return { data: parsed.data }
}

export async function requireUser(): Promise<
  | { user: SessionUserDto; response?: never }
  | { user?: never; response: NextResponse<ApiError> }
> {
  const user = await getSessionUser()
  if (!user) return { response: unauthorized() }
  return { user }
}

/** Official accounts only — broadcasts, safe zones, verification. */
export async function requireOfficial(): Promise<
  | { user: SessionUserDto; response?: never }
  | { user?: never; response: NextResponse<ApiError> }
> {
  const result = await requireUser()
  if (result.response) return result
  if (result.user.role !== "OFFICIAL") return { response: forbidden() }
  return { user: result.user }
}
