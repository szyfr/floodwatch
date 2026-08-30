"use client"

import * as React from "react"

import {
  enqueueReport,
  getQueue,
  getServerQueue,
  replaceQueue,
  subscribeQueue,
  type QueuedReport,
} from "@/lib/offline-store"

// The hook is mounted on more than one screen at a time, so the guard has to
// be module-wide or two copies would race the same queue on reconnect.
let flushing = false

/**
 * Flushes the offline queue the moment connectivity returns. `clientId` makes
 * each retry idempotent, so a report that actually landed before the network
 * dropped is not filed twice.
 */
export function useOfflineQueue(
  online: boolean,
  onFlushed?: (count: number) => void
) {
  const queue = React.useSyncExternalStore(
    subscribeQueue,
    getQueue,
    getServerQueue
  )
  const flushed = React.useRef(onFlushed)

  React.useEffect(() => {
    flushed.current = onFlushed
  })

  const flush = React.useCallback(async () => {
    if (flushing) return
    const pending = getQueue()
    if (pending.length === 0) return
    flushing = true

    const remaining: QueuedReport[] = []
    let sent = 0
    for (const item of pending) {
      try {
        const response = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        })
        // 409 means the server already has it - count it as delivered.
        if (response.ok || response.status === 409) sent += 1
        else if (response.status >= 500) remaining.push(item)
        // Any other 4xx will never be accepted; drop it rather than retry forever.
      } catch {
        remaining.push(item)
      }
    }

    flushing = false
    if (remaining.length !== pending.length) replaceQueue(remaining)
    if (sent > 0) flushed.current?.(sent)
  }, [])

  React.useEffect(() => {
    if (online) void flush()
  }, [online, flush])

  return { queue, queuedCount: queue.length, enqueue: enqueueReport, flush }
}
