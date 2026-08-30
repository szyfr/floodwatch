"use client"

import { MapPinIcon, XIcon } from "@phosphor-icons/react"

import styles from "@/components/alerts/alert-card.module.css"
import { useLanguage } from "@/components/providers/language-provider"
import { Button } from "@/components/ui/button"
import { PRIORITY_COLOR, formatAgo, minutesSince } from "@/lib/domain"
import type { AlertDto } from "@/lib/dto"

/** One broadcast in the list - design lines 549-568. */
export function AlertCard({
  alert,
  onDismiss,
}: {
  alert: AlertDto
  onDismiss: (id: string) => void
}) {
  const { t, lang } = useLanguage()

  const color = PRIORITY_COLOR[alert.priority]
  // Tagalog copy is optional per alert; English is the shape of record.
  const title = (lang === "tl" && alert.titleTl) || alert.title
  const message = (lang === "tl" && alert.messageTl) || alert.message
  const areaNames = alert.areas.map((area) => area.name).join(", ")
  const areaLabel =
    alert.scope === "PROVINCE" || !areaNames ? t.scope.provinceWide : areaNames

  return (
    <article className={styles.card} style={{ borderLeftColor: color }}>
      <div className={styles.body}>
        <div className={styles.pills}>
          <span className={styles.priority} style={{ background: color }}>
            {t.prio[alert.priority]}
          </span>
          <span className={styles.type}>{t.type[alert.type]}</span>
          <span className={styles.area} title={areaLabel}>
            <MapPinIcon size={12} weight="bold" />
            <span className={styles.areaLabel}>{areaLabel}</span>
          </span>
          {/* The clock only advances on the client, so the server text may differ. */}
          <time
            className={styles.ago}
            dateTime={alert.createdAt}
            suppressHydrationWarning
          >
            {formatAgo(minutesSince(alert.createdAt), lang)}
          </time>
        </div>

        <h2 className={styles.title}>{title}</h2>
        <p className={styles.message}>{message}</p>
        <span
          className={styles.from}
        >{`${t.alerts.from} · ${alert.sentBy}`}</span>
      </div>

      <Button
        variant="ghost"
        aria-label="Dismiss"
        className={styles.dismiss}
        onClick={() => onDismiss(alert.id)}
      >
        <XIcon size={15} weight="bold" />
      </Button>
    </article>
  )
}
