"use client"

import * as React from "react"
import { io, type Socket } from "socket.io-client"

import {
  SOCKET_PATH,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@/lib/realtime/events"

export type FloodWatchSocket = Socket<
  ServerToClientEvents,
  ClientToServerEvents
>

/**
 * One connection per tab. Held outside React so the provider does not have to
 * publish it through state - the instance exists from the first client render,
 * and socket.io buffers anything emitted before the handshake completes.
 */
let singleton: FloodWatchSocket | null = null

function getSocket(): FloodWatchSocket | null {
  if (typeof window === "undefined") return null
  singleton ??= io({
    path: SOCKET_PATH,
    addTrailingSlash: false,
    transports: ["websocket", "polling"],
  })
  return singleton
}

type SocketContextValue = {
  socket: FloodWatchSocket | null
  connected: boolean
}

const SocketContext = React.createContext<SocketContextValue>({
  socket: null,
  connected: false,
})

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket] = React.useState(getSocket)
  const [connected, setConnected] = React.useState(false)

  React.useEffect(() => {
    if (!socket) return
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    socket.on("connect", onConnect)
    socket.on("disconnect", onDisconnect)
    if (socket.connected) onConnect()
    return () => {
      socket.off("connect", onConnect)
      socket.off("disconnect", onDisconnect)
    }
  }, [socket])

  const value = React.useMemo(
    () => ({ socket, connected }),
    [socket, connected]
  )

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  )
}

export function useSocket(): SocketContextValue {
  return React.useContext(SocketContext)
}

/**
 * Subscribes to one server event for the life of the component. The handler is
 * kept in a ref so callers need not memoise it.
 */
export function useSocketEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: ServerToClientEvents[E]
): void {
  const { socket } = useSocket()
  const ref = React.useRef(handler)

  React.useEffect(() => {
    ref.current = handler
  })

  React.useEffect(() => {
    if (!socket) return
    // The public signature above is what callers see; socket.io's conditional
    // listener type cannot be satisfied through an unresolved generic, so the
    // registration itself is cast.
    const listener = (...args: unknown[]) =>
      (ref.current as unknown as (...a: unknown[]) => void)(...args)
    socket.on(event as never, listener as never)
    return () => {
      socket.off(event as never, listener as never)
    }
  }, [socket, event])
}

/** Keeps the socket in the room for the area the viewer is looking at. */
export function useScope(lguSlug: string | null): void {
  const { socket, connected } = useSocket()
  React.useEffect(() => {
    if (!socket || !connected) return
    socket.emit("scope:join", { lguSlug })
  }, [socket, connected, lguSlug])
}
