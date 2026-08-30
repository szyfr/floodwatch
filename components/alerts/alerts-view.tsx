"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeftIcon } from "@phosphor-icons/react"

import { AlertCard } from "@/components/alerts/alert-card"
import styles from "@/components/alerts/alerts-view.module.css"
import { useLanguage } from "@/components/providers/language-provider"
import { showToast } from "@/components/toast"
import { useSocketEvent } from "@/components/providers/socket-provider"
import {
  dismissAlertLocally,
  getDismissed,
  getServerDismissed,
  subscribeDismissed,
} from "@/lib/alerts-store"
import { api } from "@/lib/client-api"
import type { AlertDto } from "@/lib/dto"

/** Mirrors the server-side scope filter in `listAlerts`. */
function inScope(alert: AlertDto, scopeSlug: string | null): boolean {
  if (!scopeSlug || alert.scope === "PROVINCE") return true
  return alert.areas.some((area) => area.slug === scopeSlug)
}

export function AlertsView({
  alerts,
  scopeSlug,
  signedIn,
}: {
  alerts: AlertDto[]
  scopeSlug: string | null
  signedIn: boolean
}) {
  const { t } = useLanguage()
  const router = useRouter()

  // Broadcasts that landed after this page rendered, and the ids this viewer
  // cleared. Both are merged during render rather than copied into state, so a
  // navigation can never show a list the server has already moved past.
  const [liveAlerts, setLiveAlerts] = React.useState<AlertDto[]>([])
  // Device-local dismissals live in a shared store, so the header badge and the
  // banner in the shell agree with this list — for signed-out readers that
  // store is the only record there is.
  const dismissedIds = React.useSyncExternalStore(
    subscribeDismissed,
    getDismissed,
    getServerDismissed
  )

  useSocketEvent("alert:created", (alert) => {
    if (!inScope(alert, scopeSlug)) return
    setLiveAlerts((current) =>
      current.some((existing) => existing.id === alert.id)
        ? current
        : [alert, ...current]
    )
  })

  const visible = React.useMemo(() => {
    const known = new Set(alerts.map((alert) => alert.id))
    return [
      ...liveAlerts.filter((alert) => !known.has(alert.id)),
      ...alerts,
    ].filter((alert) => !alert.dismissed && !dismissedIds.has(alert.id))
  }, [alerts, liveAlerts, dismissedIds])

  async function dismiss(id: string) {
    dismissAlertLocally(id)
    // A dismissal is per-account; signed-out readers only clear it on this device.
    if (!signedIn) return
    try {
      await api.dismissAlert(id)
      // Re-reads the layout's alert list so the header badge drops too.
      router.refresh()
    } catch {
      // The local store keeps it hidden for now; the next load restores it.
      showToast(t.toast.error, t.toast.errorSub, "warn")
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link
          href={scopeSlug ? `/dashboard?lgu=${scopeSlug}` : "/dashboard"}
          aria-label="Back"
          className={styles.back}
        >
          <ArrowLeftIcon size={18} />
        </Link>
        <div className={styles.heading}>
          <h1 className={styles.title}>{t.alerts.title}</h1>
          <span className={styles.subtitle}>{t.alerts.sub}</span>
        </div>
      </div>

      {visible.length > 0 ? (
        <ul className={styles.list}>
          {visible.map((alert) => (
            <li key={alert.id} className={styles.item}>
              <AlertCard alert={alert} onDismiss={dismiss} />
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>{t.alerts.empty}</p>
      )}
    </div>
  )
}
