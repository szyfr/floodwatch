import type { AlertPriority, AlertType } from "@/lib/domain"

/**
 * The notification body, written on the server because the service worker
 * cannot read the app's language store.
 *
 * Only ONE language is ever sent. The encrypted payload ceiling is 4096 octets
 * and RFC 8291 leaves roughly 3993 for plaintext after headers, padding and the
 * GCM tag, so shipping both renderings would put a long bilingual evacuation
 * order over the edge - and a 413 is a message nobody receives.
 */
export const PUSH_TITLE_MAX = 90
export const PUSH_BODY_MAX = 220

/** Comfortably under the RFC 8291 plaintext ceiling, with room for the tag. */
const PAYLOAD_MAX_BYTES = 3_000

export type PushAlert = {
  id: string
  title: string
  titleTl: string | null
  message: string
  messageTl: string | null
  type: AlertType
  priority: AlertPriority
}

function clamp(value: string, max: number): string {
  const trimmed = value.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trimEnd()}…`
}

export function buildPushPayload(alert: PushAlert, language: string): string {
  // Tagalog copy is optional per alert; English is the shape of record. Same
  // fallback as components/alerts/alert-card.tsx.
  const tl = language === "tl"
  const title = (tl && alert.titleTl) || alert.title
  const body = (tl && alert.messageTl) || alert.message

  const payload = JSON.stringify({
    id: alert.id,
    title: clamp(title, PUSH_TITLE_MAX),
    body: clamp(body, PUSH_BODY_MAX),
    type: alert.type,
    priority: alert.priority,
  })

  // The clamps above make this unreachable for real content. It stands because
  // the failure it prevents is a 413 from the push service, which reads as
  // "delivered nothing" and would otherwise be diagnosed as a dead handset.
  if (Buffer.byteLength(payload, "utf8") > PAYLOAD_MAX_BYTES) {
    return JSON.stringify({
      id: alert.id,
      title: clamp(title, PUSH_TITLE_MAX),
      body: "",
      type: alert.type,
      priority: alert.priority,
    })
  }
  return payload
}
