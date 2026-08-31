/**
 * Dispatch state shared between the custom server and the Next bundle.
 *
 * This module is the ONE push file server.ts may import, so it deliberately has
 * no imports of its own - not Prisma, not env, and above all not "server-only",
 * which throws under tsx's resolution conditions.
 *
 * The state lives on globalThis for the reason lib/realtime/registry.ts already
 * documents: the tsx graph and the Turbopack bundle are two module graphs in one
 * process, and a module-level Set would hand each side its own copy. `running`
 * would then fail to stop a sweep and a fresh broadcast dispatching the same
 * alert twice, and `stopping` set by the signal handler would never be seen by
 * the dispatcher it is meant to stop.
 */
type PushState = { running: Set<string>; stopping: boolean }

const globalForPush = globalThis as unknown as { __floodwatchPush?: PushState }

export function pushState(): PushState {
  const existing = globalForPush.__floodwatchPush
  if (existing) return existing
  const created: PushState = { running: new Set(), stopping: false }
  globalForPush.__floodwatchPush = created
  return created
}

/**
 * Called from server.ts on SIGINT/SIGTERM, before app.close(). The dispatcher
 * checks this between sends, so the page in flight finishes, its cursor is
 * written, and the process exits inside the unit's TimeoutStopSec instead of
 * being SIGKILLed mid-fan-out.
 */
export function stopDispatching(): void {
  pushState().stopping = true
}

export function isStopping(): boolean {
  return pushState().stopping
}
