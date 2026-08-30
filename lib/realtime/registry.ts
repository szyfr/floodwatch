/**
 * The bridge between the custom server (loaded by tsx) and the route handlers
 * (loaded from the Next bundle). They are two module graphs inside one process,
 * so the instance has to travel through globalThis - a shared import would hand
 * each side its own copy.
 */
import type { Server as SocketIOServer } from "socket.io"

import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@/lib/realtime/events"

export type FloodWatchServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>

const globalForSocket = globalThis as unknown as {
  __floodwatchIO?: FloodWatchServer
}

export function registerSocketServer(io: FloodWatchServer): void {
  globalForSocket.__floodwatchIO = io
}

/** null when the app is running without the custom server (e.g. `next build`). */
export function getSocketServer(): FloodWatchServer | null {
  return globalForSocket.__floodwatchIO ?? null
}
