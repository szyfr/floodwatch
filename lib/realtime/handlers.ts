import { PROVINCE_ROOM, lguRoom } from "@/lib/realtime/events"
import type { FloodWatchServer } from "@/lib/realtime/registry"

/**
 * Every socket sits in the province room and, when the viewer narrows to a city
 * or municipality, in that LGU's room as well.
 */
export function attachSocketHandlers(io: FloodWatchServer): void {
  io.on("connection", (socket) => {
    void socket.join(PROVINCE_ROOM)
    socket.data.lguSlug = null

    socket.on("scope:join", ({ lguSlug }) => {
      const previous = socket.data.lguSlug
      if (previous === lguSlug) return
      if (previous) void socket.leave(lguRoom(previous))
      if (lguSlug) void socket.join(lguRoom(lguSlug))
      socket.data.lguSlug = lguSlug
    })
  })
}
