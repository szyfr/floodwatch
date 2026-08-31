"use client"

import * as React from "react"
import { BellRingingIcon, ShareNetworkIcon, XIcon } from "@phosphor-icons/react"

import styles from "@/components/push/push-invite.module.css"
import { useLanguage } from "@/components/providers/language-provider"
import { PushToggle } from "@/components/push/push-toggle"
import {
  getServerSupport,
  getSupport,
  isIos,
  subscribeSupport,
} from "@/lib/push/client"
import {
  dismissInvite,
  getInviteDismissed,
  getServerInviteDismissed,
  getServerPush,
  getStoredPush,
  subscribePush,
} from "@/lib/push/push-store"
import type { LguDto } from "@/lib/dto"

/**
 * The card at the top of /alerts.
 *
 * A control only reachable from the nav drawer will be found by nobody, and
 * reach is the entire point of this feature. On an iPhone that has not been
 * installed it renders the two Add to Home Screen steps instead of a dead
 * button, because there is no API that can do it for the reader.
 */
export function PushInvite({
  vapidPublicKey,
  lgus,
  defaultLgu,
}: {
  vapidPublicKey: string | null
  lgus: LguDto[]
  defaultLgu: string | null
}) {
  const { t } = useLanguage()
  const support = React.useSyncExternalStore(
    subscribeSupport,
    getSupport,
    getServerSupport
  )
  const record = React.useSyncExternalStore(
    subscribePush,
    getStoredPush,
    getServerPush
  )
  const dismissed = React.useSyncExternalStore(
    subscribePush,
    getInviteDismissed,
    getServerInviteDismissed
  )

  if (!vapidPublicKey || support === null) return null
  // Already on, already asked and declined, or a platform that cannot do it at
  // all: in every case the drawer row is the right place for this, not a card.
  if (record || dismissed) return null
  if (support === "unsupported" || support === "insecure" || support === "denied") {
    return null
  }

  const needsInstall = support === "ios-install" && isIos()

  return (
    <aside className={styles.card}>
      <div className={styles.head}>
        <BellRingingIcon size={20} weight="fill" className={styles.icon} />
        <div className={styles.copy}>
          <h2 className={styles.title}>{t.push.inviteTitle}</h2>
          <p className={styles.body}>{t.push.inviteBody}</p>
        </div>
        <button
          type="button"
          className={styles.dismiss}
          aria-label={t.push.inviteDismiss}
          onClick={dismissInvite}
        >
          <XIcon size={16} weight="bold" />
        </button>
      </div>

      {needsInstall ? (
        <p className={styles.steps}>
          <ShareNetworkIcon size={16} /> {t.push.iosSteps}
        </p>
      ) : (
        <div className={styles.action}>
          <PushToggle
            vapidPublicKey={vapidPublicKey}
            lgus={lgus}
            defaultLgu={defaultLgu}
            compact
          />
        </div>
      )}
    </aside>
  )
}
