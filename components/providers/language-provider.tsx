"use client"

import * as React from "react"

import { dictionaries, type Dictionary } from "@/lib/i18n/dictionary"
import {
  getServerLanguage,
  getStoredLanguage,
  storeLanguage,
  subscribeLanguage,
} from "@/lib/i18n/language-store"
import type { Language } from "@/lib/domain"

type LanguageContextValue = {
  lang: Language
  t: Dictionary
  setLang: (lang: Language) => void
}

const LanguageContext = React.createContext<LanguageContextValue | null>(null)

export function LanguageProvider({
  initialLanguage = "en",
  children,
}: {
  initialLanguage?: Language
  children: React.ReactNode
}) {
  // The account's saved preference is the default; a device-local choice wins.
  const stored = React.useSyncExternalStore(
    subscribeLanguage,
    getStoredLanguage,
    getServerLanguage
  )
  const lang = stored ?? initialLanguage

  const setLang = React.useCallback((next: Language) => {
    storeLanguage(next)
    document.documentElement.lang = next
    // Persist for signed-in users; a failure here is not worth interrupting anyone.
    void fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: next }),
    }).catch(() => {})
  }, [])

  const value = React.useMemo<LanguageContextValue>(
    () => ({ lang, t: dictionaries[lang], setLang }),
    [lang, setLang]
  )

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageContextValue {
  const context = React.useContext(LanguageContext)
  if (!context)
    throw new Error("useLanguage must be used inside <LanguageProvider>")
  return context
}

/** Shorthand for the common `const { t } = useLanguage()`. */
export function useT(): Dictionary {
  return useLanguage().t
}
