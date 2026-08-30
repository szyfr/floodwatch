"use client"

import { WifiSlashIcon } from "@phosphor-icons/react"

import styles from "@/components/shell/offline-banner.module.css"
import { useLanguage } from "@/components/providers/language-provider"

/**
 * Shown above every screen - including sign in and sign up, where the design
 * places it outside the screen switch.
 */
export function OfflineBanner({ queuedCount = 0 }: { queuedCount?: number }) {
  const { t } = useLanguage()

  return (
    <div className={styles.banner} role="status">
      <WifiSlashIcon size={17} className={styles.icon} />
      <div className={styles.body}>
        <span className={styles.text}>{t.offline.banner}</span>
        {queuedCount > 0 ? (
          <span className={styles.queue}>
            {queuedCount}{" "}
            {queuedCount === 1 ? t.offline.queued : t.offline.queuedPl}
          </span>
        ) : null}
      </div>
    </div>
  )
}
