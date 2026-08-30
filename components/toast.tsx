"use client"

import {
  CheckCircleIcon,
  InfoIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react"
import { toast as sonner } from "sonner"

import styles from "@/components/toast.module.css"

export type ToastKind = "ok" | "warn" | "info"

const ICONS = {
  ok: CheckCircleIcon,
  warn: WarningCircleIcon,
  info: InfoIcon,
} as const

/**
 * The design ships one toast shape for every message, so this is the only way
 * the app raises them. Auto-dismiss matches the prototype's 3.6s.
 */
export function showToast(
  title: string,
  sub: string,
  kind: ToastKind = "ok"
): void {
  const Icon = ICONS[kind]
  sonner.custom(
    (id) => (
      <div
        className={`${styles.toast} ${styles[kind]}`}
        role="status"
        aria-live="polite"
      >
        <Icon size={19} weight="regular" className={styles.icon} />
        <div className={styles.body}>
          <span className={styles.title}>{title}</span>
          <span className={styles.sub}>{sub}</span>
        </div>
        <button
          type="button"
          aria-label="Close"
          className={styles.close}
          onClick={() => sonner.dismiss(id)}
        >
          <XIcon size={14} weight="bold" />
        </button>
      </div>
    ),
    { duration: 3600 }
  )
}
