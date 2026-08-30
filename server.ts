/**
 * Next.js and Socket.io share one HTTP listener.
 *
 * Order matters: the Next request handler must be attached to the server before
 * socket.io, because engine.io caches the existing 'request' listeners at attach
 * time and then removes them all.
 */
import { createServer, type Server as HttpServer } from "node:http"

import "dotenv/config"
import next from "next"
import { Server as SocketIOServer } from "socket.io"

import { SOCKET_PATH } from "./lib/realtime/events"
import { registerSocketServer } from "./lib/realtime/registry"
import { attachSocketHandlers } from "./lib/realtime/handlers"

const dev = process.env.NODE_ENV !== "production"
const hostname = process.env.HOSTNAME ?? "localhost"
const port = Number(process.env.PORT ?? 3000)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

await app.prepare()

const httpServer: HttpServer = createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error("[next] request failed", error)
    res.statusCode = 500
    res.end("Internal Server Error")
  })
})

const io = new SocketIOServer(httpServer, {
  path: SOCKET_PATH,
  addTrailingSlash: false,
  serveClient: false,
})

// Route handlers live in a different module graph (Turbopack bundle vs tsx), so
// globalThis is the only bridge that actually shares this instance with them.
registerSocketServer(io)
attachSocketHandlers(io)

// Next attaches its own 'upgrade' listener lazily for HMR — do not add one here.
httpServer.listen(port, hostname, () => {
  console.log(
    `> Pampanga Flood Watch on http://${hostname}:${port}  (dev=${dev})`
  )
  console.log(`> realtime on ${SOCKET_PATH}`)
})

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    io.close()
    httpServer.close()
    void app.close().finally(() => process.exit(0))
  })
}
