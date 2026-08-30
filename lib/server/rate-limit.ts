import "server-only"

/**
 * A fixed-window counter, in process memory.
 *
 * This is a correct global counter rather than a per-worker approximation only
 * because DEPLOYMENT.md guarantees one process: "It is a single process, on
 * purpose" - route handlers reach Socket.io through globalThis and there is no
 * Redis adapter. Run two copies and every limit here silently doubles, on top
 * of the realtime fan-out that change already halves.
 *
 * Counters reset on restart, and Turbopack's module reloads reset them in
 * development. Both are fine: this bounds abuse, it does not bill anyone.
 */
const WINDOW_MS = 60_000

/** Sweep expired keys once the map gets big, so it cannot grow without bound. */
const SWEEP_AT = 5_000

const hits = new Map<string, { count: number; resetAt: number }>()

/** Counts one hit against `key` and reports whether it has gone over `max`. */
export function overLimit(key: string, max: number): boolean {
  const now = Date.now()
  if (hits.size > SWEEP_AT) {
    for (const [seen, window] of hits) {
      if (now >= window.resetAt) hits.delete(seen)
    }
  }
  const window = hits.get(key)
  if (!window || now >= window.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  window.count += 1
  return window.count > max
}
