"use client"

import * as React from "react"
import { BellRingingIcon } from "@phosphor-icons/react"

import styles from "@/components/push/push-toggle.module.css"
import { useLanguage } from "@/components/providers/language-provider"
import { Switch } from "@/components/ui/switch"
import {
  getServerSupport,
  getSupport,
  sendTestPush,
  subscribeDevice,
  subscribeSupport,
  unsubscribeDevice,
  type SubscribeFailure,
} from "@/lib/push/client"
import {
  getServerPush,
  getStoredPush,
  subscribePush,
} from "@/lib/push/push-store"
import type { LguDto } from "@/lib/dto"

/**
 * The opt-in control. Mounted in the nav drawer above the language row, and
 * inside the invite card on /alerts.
 *
 * Support is read through useSyncExternalStore rather than an effect, because
 * every fact this renders is discovered asynchronously and
 * react-hooks/set-state-in-effect is an error here.
 */
export function PushToggle({
  vapidPublicKey,
  lgus,
  defaultLgu,
  compact = false,
}: {
  vapidPublicKey: string
  lgus: LguDto[]
  defaultLgu: string | null
  compact?: boolean
}) {
  const { t, lang } = useLanguage()
  const record = React.useSyncExternalStore(
    subscribePush,
    getStoredPush,
    getServerPush
  )

  const support = React.useSyncExternalStore(
    subscribeSupport,
    getSupport,
    getServerSupport
  )
  const [pending, setPending] = React.useState(false)
  const [failure, setFailure] = React.useState<SubscribeFailure | null>(null)
  const [note, setNote] = React.useState<string | null>(null)
  const [area, setArea] = React.useState(defaultLgu ?? lgus[0]?.slug ?? "")
  // Stands stale attempts down, the way locate-button.tsx's does: a reader who
  // toggles twice must not have the first run's result land on the second.
  const attempt = React.useRef(0)

  const on = record !== null
  const areaName = lgus.find((lgu) => lgu.slug === (record?.lgu ?? area))?.name

  async function turnOn() {
    if (pending) return
    const id = ++attempt.current
    setPending(true)
    setFailure(null)
    setNote(null)

    const result = await subscribeDevice({
      vapidPublicKey,
      lgu: area,
      language: lang,
    })
    if (id !== attempt.current) return

    if (!result.ok) {
      setFailure(result.reason)
      setPending(false)
      return
    }

    // The proof that opting in did something. Without it the first evidence
    // the feature works would be a real evacuation order.
    const sent = await sendTestPush(result.record.endpoint)
    if (id !== attempt.current) return
    setNote(sent ? t.push.testSent : t.push.testFailed)
    setPending(false)
  }

  async function turnOff() {
    if (pending) return
    const id = ++attempt.current
    setPending(true)
    setFailure(null)
    setNote(null)
    await unsubscribeDevice()
    if (id !== attempt.current) return
    setNote(t.push.disabled)
    setPending(false)
  }

  // Nothing renders server-side or during hydration, so the switch cannot
  // flash "off" at somebody who is already subscribed.
  if (support === null) return null

  if (support !== "ready" && !on) {
    return (
      <div className={`${styles.root} ${compact ? styles.compact : ""}`}>
        <div className={styles.row}>
          <BellRingingIcon size={17} />
          <span className={styles.label}>{t.push.label}</span>
        </div>
        <p className={styles.note} role="status">
          {support === "insecure"
            ? t.push.insecure
            : support === "ios-install"
              ? `${t.push.iosInstall} ${t.push.iosSteps}`
              : support === "denied"
                ? t.push.denied
                : t.push.unsupported}
        </p>
      </div>
    )
  }

  const status = on
    ? areaName
      ? t.push.onIn.replace("{area}", areaName)
      : t.push.on
    : t.push.off

  return (
    <div className={`${styles.root} ${compact ? styles.compact : ""}`}>
      <div className={styles.row}>
        <BellRingingIcon size={17} />
        <span className={styles.label}>{t.push.label}</span>
        <Switch
          checked={on}
          disabled={pending}
          onCheckedChange={(next) => {
            if (next) void turnOn()
            else void turnOff()
          }}
          aria-label={on ? t.push.turnOff : t.push.turnOn}
        />
      </div>

      {!on ? (
        <label className={styles.areaRow}>
          <span className={styles.areaLabel}>{t.push.area}</span>
          <select
            className={styles.select}
            value={area}
            onChange={(event) => setArea(event.target.value)}
            disabled={pending}
          >
            {lgus.map((lgu) => (
              <option key={lgu.slug} value={lgu.slug}>
                {lgu.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {/* Mounted from the start with its text swapped in, for the reason
          locate-button.tsx gives: a polite live region that arrives in the same
          commit as its content is announced unreliably, and every one of these
          lines answers something the reader just pressed. */}
      <p
        className={`${styles.note} ${!pending && !failure && !note ? styles.quiet : ""}`}
        role="status"
      >
        {pending
          ? t.push.busy
          : failure
            ? t.push[failure]
            : (note ?? status)}
      </p>
    </div>
  )
}
