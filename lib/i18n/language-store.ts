/**
 * The viewer's language choice, remembered on the device. An external store so
 * the provider can subscribe without reading localStorage during render (which
 * would desync hydration) or setting state from an effect.
 */
import type { Language } from "@/lib/domain"

const STORAGE_KEY = "fw.lang"

let cache: Language | null | undefined
const listeners = new Set<() => void>()

export function subscribeLanguage(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/** null when the device has no stored preference — the caller falls back. */
export function getStoredLanguage(): Language | null {
  if (cache === undefined) {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      cache = stored === "tl" || stored === "en" ? stored : null
    } catch {
      cache = null
    }
  }
  return cache
}

export function getServerLanguage(): Language | null {
  return null
}

export function storeLanguage(lang: Language): void {
  cache = lang
  try {
    window.localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* private mode — the choice still holds for this session */
  }
  for (const listener of listeners) listener()
}
