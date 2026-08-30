"use client"

import * as React from "react"

/**
 * One 30-second clock for every relative time on a page.
 *
 * Reading "now" through a store rather than calling Date.now() during render
 * keeps the hydrated markup identical to the server's — the server's own clock
 * answers for the first render, the reader's takes over on hydration — and ages
 * every card on the screen in the same beat rather than each on its own timer.
 *
 * The store is module-level, so the dashboard and the report console share one
 * interval no matter how many components read it.
 */
const listeners = new Set<() => void>()
let clockNow = Date.now()
let clockTimer: ReturnType<typeof setInterval> | null = null

function subscribe(onStoreChange: () => void): () => void {
  clockNow = Date.now()
  listeners.add(onStoreChange)
  clockTimer ??= setInterval(() => {
    clockNow = Date.now()
    for (const listener of listeners) listener()
  }, 30_000)

  return () => {
    listeners.delete(onStoreChange)
    if (listeners.size === 0 && clockTimer !== null) {
      clearInterval(clockTimer)
      clockTimer = null
    }
  }
}

/** `serverNow` is the moment the page was rendered, as an epoch millisecond. */
export function useClock(serverNow: number): number {
  return React.useSyncExternalStore(
    subscribe,
    () => clockNow,
    () => serverNow
  )
}
