/**
 * Reports written with no signal are parked in localStorage and flushed when
 * the connection returns. Kept as an external store so React can subscribe
 * without a setState-in-effect round-trip.
 */
import type { CreateReportInput } from "@/lib/validation"

const STORAGE_KEY = "fw.queue.reports"

export type QueuedReport = CreateReportInput & {
  clientId: string
  queuedAt: number
}

const EMPTY: QueuedReport[] = []

let cache: QueuedReport[] | null = null
const listeners = new Set<() => void>()

function load(): QueuedReport[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as QueuedReport[]) : EMPTY
    return Array.isArray(parsed) ? parsed : EMPTY
  } catch {
    return EMPTY
  }
}

function save(items: QueuedReport[]): void {
  cache = items
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    /* storage blocked or full - the queue lives on in memory for this session */
  }
  for (const listener of listeners) listener()
}

export function subscribeQueue(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/** Cached so repeat calls are reference-stable, as useSyncExternalStore needs. */
export function getQueue(): QueuedReport[] {
  cache ??= load()
  return cache
}

export function getServerQueue(): QueuedReport[] {
  return EMPTY
}

export function enqueueReport(
  report: CreateReportInput & { clientId: string }
): void {
  save([...getQueue(), { ...report, queuedAt: Date.now() }])
}

export function replaceQueue(items: QueuedReport[]): void {
  save(items)
}
