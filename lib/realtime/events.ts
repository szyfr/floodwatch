/**
 * The Socket.io contract. The custom server (server.ts), the route handlers
 * that emit, and the client hook all import from here.
 */
import type { AlertDto, GaugeDto, PublicReportDto, ZoneDto } from "@/lib/dto"

export const SOCKET_PATH = process.env.NEXT_PUBLIC_SOCKET_PATH || "/ws"

/** Everyone listens to the province room; scope adds one LGU room on top. */
export const PROVINCE_ROOM = "province"
export const lguRoom = (slug: string) => `lgu:${slug}`
export const userRoom = (userId: string) => `user:${userId}`

export type ReportDeletedPayload = { id: string; lguSlug: string }
export type ReportVotedPayload = {
  id: string
  lguSlug: string
  upvotes: number
  downvotes: number
}
export type ZoneDeletedPayload = { id: string; lguSlug: string }

export type ServerToClientEvents = {
  "report:created": (report: PublicReportDto) => void
  "report:updated": (report: PublicReportDto) => void
  "report:deleted": (payload: ReportDeletedPayload) => void
  "report:voted": (payload: ReportVotedPayload) => void
  "alert:created": (alert: AlertDto) => void
  "zone:created": (zone: ZoneDto) => void
  "zone:updated": (zone: ZoneDto) => void
  "zone:deleted": (payload: ZoneDeletedPayload) => void
  "gauge:updated": (gauge: GaugeDto) => void
}

export type ClientToServerEvents = {
  /** Re-room the socket when the viewer changes area. null = province only. */
  "scope:join": (payload: { lguSlug: string | null }) => void
}

export type SocketData = {
  userId: string | null
  lguSlug: string | null
}
