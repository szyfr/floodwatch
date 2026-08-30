import type { NextResponse } from "next/server"

import { json } from "@/lib/api"
import { endSession } from "@/lib/auth/session"

export async function POST(): Promise<NextResponse<{ ok: true }>> {
  await endSession()
  return json({ ok: true } as const)
}
