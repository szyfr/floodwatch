/**
 * Alerts cleared on this device. A signed-in viewer's dismissal is persisted
 * server-side, but the list, the header badge and the banner all have to agree
 * immediately - and for a signed-out reader this store is the only record.
 *
 * External store rather than component state so every surface sees the same
 * set without prop-drilling through the shell.
 */
const STORAGE_KEY = "fw.dismissed.alerts"

let cache: ReadonlySet<string> | undefined
const listeners = new Set<() => void>()
const EMPTY: ReadonlySet<string> = new Set()

function read(): ReadonlySet<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!Array.isArray(parsed)) return EMPTY
    return new Set(parsed.filter((id): id is string => typeof id === "string"))
  } catch {
    return EMPTY
  }
}

export function subscribeDismissed(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

export function getDismissed(): ReadonlySet<string> {
  cache ??= read()
  return cache
}

export function getServerDismissed(): ReadonlySet<string> {
  return EMPTY
}

export function dismissAlertLocally(id: string): void {
  const next = new Set(getDismissed())
  next.add(id)
  cache = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
  } catch {
    /* private mode - the dismissal still holds for this tab */
  }
  for (const listener of listeners) listener()
}
