import "server-only"

import {
  PROVINCE_ROOM,
  lguRoom,
  type ServerToClientEvents,
} from "@/lib/realtime/events"
import { getSocketServer } from "@/lib/realtime/registry"

/**
 * Broadcasts to the province room and, when the change belongs to one city or
 * municipality, to that room too. Rooms de-duplicate, so a viewer in both gets
 * a single copy.
 *
 * Silently no-ops when the socket server is absent (build-time prerender,
 * scripts) — realtime is an enhancement, never a hard dependency of a write.
 */
export function broadcast<E extends keyof ServerToClientEvents>(
  event: E,
  payload: Parameters<ServerToClientEvents[E]>[0],
  lguSlug?: string | null
): void {
  const io = getSocketServer()
  if (!io) return
  const rooms = lguSlug ? [PROVINCE_ROOM, lguRoom(lguSlug)] : [PROVINCE_ROOM]
  // @ts-expect-error socket.io's variadic emit cannot see through the generic
  io.to(rooms).emit(event, payload)
}
