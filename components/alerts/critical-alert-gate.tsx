"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertDialog } from "@base-ui/react/alert-dialog"
import { ShieldIcon, WarningIcon } from "@phosphor-icons/react"

import styles from "@/components/alerts/critical-alert-gate.module.css"
import { useLanguage } from "@/components/providers/language-provider"
import { useSocketEvent } from "@/components/providers/socket-provider"
import { formatAgo, minutesSince } from "@/lib/domain"
import type { AlertDto } from "@/lib/dto"

const ACK_KEY = "fw.ack.critical"

/**
 * Acknowledged evacuation orders, remembered on the device. An external store
 * so the gate can read localStorage without touching it during render or
 * setting state from an effect - the same shape as lib/i18n/language-store.ts.
 */
let cache: ReadonlySet<string> | undefined
const listeners = new Set<() => void>()

function read(): ReadonlySet<string> {
  try {
    const raw = window.localStorage.getItem(ACK_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === "string"))
  } catch {
    return new Set()
  }
}

function subscribeAcknowledged(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

function getAcknowledged(): ReadonlySet<string> | null {
  cache ??= read()
  return cache
}

/** null means "not known yet" - an order already acknowledged must not flash. */
function getAcknowledgedOnServer(): ReadonlySet<string> | null {
  return null
}

function acknowledge(id: string): void {
  const next = new Set(getAcknowledged() ?? [])
  next.add(id)
  cache = next
  try {
    window.localStorage.setItem(ACK_KEY, JSON.stringify([...next]))
  } catch {
    /* private mode - the acknowledgement still holds for this tab */
  }
  for (const listener of listeners) listener()
}

/**
 * The full-bleed evacuation modal (design lines 970-990). Mounted once in the
 * app shell: it raises itself over whatever screen the viewer is on as soon as
 * a CRITICAL broadcast lands, and stays quiet the rest of the time.
 */
export function CriticalAlertGate({ alerts }: { alerts: AlertDto[] }) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()

  const acknowledged = React.useSyncExternalStore(
    subscribeAcknowledged,
    getAcknowledged,
    getAcknowledgedOnServer
  )

  const [liveAlerts, setLiveAlerts] = React.useState<AlertDto[]>([])

  useSocketEvent("alert:created", (alert) => {
    if (alert.priority !== "CRITICAL") return
    setLiveAlerts((current) =>
      current.some((existing) => existing.id === alert.id)
        ? current
        : [alert, ...current]
    )
  })

  const known = new Set(alerts.map((alert) => alert.id))
  const order = [
    ...liveAlerts.filter((alert) => !known.has(alert.id)),
    ...alerts,
  ].find(
    (alert) =>
      alert.priority === "CRITICAL" &&
      !alert.dismissed &&
      acknowledged !== null &&
      !acknowledged.has(alert.id)
  )

  if (!order) return null

  const title = (lang === "tl" && order.titleTl) || order.title
  const message = (lang === "tl" && order.messageTl) || order.message
  const areaNames = order.areas.map((area) => area.name).join(", ")
  const areaLabel =
    order.scope === "PROVINCE" || !areaNames ? t.scope.provinceWide : areaNames
  const meta = `${areaLabel} · ${order.sentBy} · ${formatAgo(
    minutesSince(order.createdAt),
    lang
  )}`

  return (
    <AlertDialog.Root open onOpenChange={() => acknowledge(order.id)}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={styles.scrim} />
        <AlertDialog.Viewport className={styles.viewport}>
          <AlertDialog.Popup className={styles.card}>
            <div className={styles.head}>
              <span className={styles.tile}>
                <WarningIcon size={23} weight="bold" />
              </span>
              <span className={styles.kicker}>{t.critical.kicker}</span>
            </div>

            <AlertDialog.Title className={styles.title}>
              {title}
            </AlertDialog.Title>
            <AlertDialog.Description className={styles.message}>
              {message}
            </AlertDialog.Description>
            <span className={styles.meta} suppressHydrationWarning>
              {meta}
            </span>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={() => {
                  acknowledge(order.id)
                  // Keep the viewer's area; drop the level/recency filters,
                  // as the design's "Show safe zones" does.
                  const scope = searchParams.get("lgu")
                  router.push(scope ? `/dashboard?lgu=${scope}` : "/dashboard")
                }}
              >
                <ShieldIcon size={18} />
                {t.critical.see}
              </button>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => acknowledge(order.id)}
              >
                {t.critical.ack}
              </button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
