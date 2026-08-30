"use client"

import * as React from "react"

import { LanguageProvider } from "@/components/providers/language-provider"
import { SessionProvider } from "@/components/providers/session-provider"
import { SocketProvider } from "@/components/providers/socket-provider"
import type { SessionUserDto } from "@/lib/dto"
import type { Language } from "@/lib/domain"

export function AppProviders({
  user,
  initialLanguage,
  children,
}: {
  user: SessionUserDto | null
  initialLanguage: Language
  children: React.ReactNode
}) {
  return (
    <SessionProvider user={user}>
      <LanguageProvider initialLanguage={initialLanguage}>
        <SocketProvider>{children}</SocketProvider>
      </LanguageProvider>
    </SessionProvider>
  )
}
