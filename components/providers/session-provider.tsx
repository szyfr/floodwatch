"use client"

import * as React from "react"

import type { SessionUserDto } from "@/lib/dto"

const SessionContext = React.createContext<SessionUserDto | null>(null)

export function SessionProvider({
  user,
  children,
}: {
  user: SessionUserDto | null
  children: React.ReactNode
}) {
  return (
    <SessionContext.Provider value={user}>{children}</SessionContext.Provider>
  )
}

/** null when nobody is signed in — the map and reports stay readable either way. */
export function useSession(): SessionUserDto | null {
  return React.useContext(SessionContext)
}

export function useIsOfficial(): boolean {
  return React.useContext(SessionContext)?.role === "OFFICIAL"
}
