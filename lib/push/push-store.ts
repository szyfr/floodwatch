/**
 * What this device remembers about its own push subscription. An external store
 * for the same reason lib/i18n/language-store.ts is one: every fact the toggle
 * renders is discovered asynchronously, and react-hooks/set-state-in-effect is
 * an error in this codebase.
 */
const STORAGE_KEY = "fw.push"
const INVITE_KEY = "fw.push.invited"

export type PushRecord = {
  endpoint: string
  lgu: string
  language: string
}

let cache: PushRecord | null | undefined
const listeners = new Set<() => void>()

export function subscribePush(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

export function getStoredPush(): PushRecord | null {
  if (cache === undefined) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : null
      cache =
        parsed &&
        typeof parsed === "object" &&
        typeof (parsed as PushRecord).endpoint === "string"
          ? (parsed as PushRecord)
          : null
    } catch {
      cache = null
    }
  }
  return cache
}

/**
 * null on the server. The toggle renders a neutral "checking" state during
 * hydration rather than flashing "off" at somebody who is already subscribed.
 */
export function getServerPush(): PushRecord | null {
  return null
}

export function storePush(record: PushRecord | null): void {
  cache = record
  try {
    if (record) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    /* private mode - the choice still holds for this session */
  }
  for (const listener of listeners) listener()
}

let inviteCache: boolean | undefined

/** Read through useSyncExternalStore, never during render. */
export function getInviteDismissed(): boolean {
  if (inviteCache === undefined) {
    try {
      inviteCache = window.localStorage.getItem(INVITE_KEY) === "1"
    } catch {
      inviteCache = false
    }
  }
  return inviteCache
}

/**
 * true on the server: the card stays out of the server-rendered markup, so a
 * reader who already dismissed it never sees it flash in before hydration
 * removes it again.
 */
export function getServerInviteDismissed(): boolean {
  return true
}

export function dismissInvite(): void {
  inviteCache = true
  try {
    window.localStorage.setItem(INVITE_KEY, "1")
  } catch {
    /* nothing to remember it with; the card returns next visit */
  }
  for (const listener of listeners) listener()
}
