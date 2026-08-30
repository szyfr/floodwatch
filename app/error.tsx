"use client"

import { useEffect } from "react"
import Link from "next/link"
import { WarningIcon } from "@phosphor-icons/react"

import styles from "@/app/error.module.css"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[floodwatch] unhandled error", error)
  }, [error])

  return (
    <div className={styles.wrap}>
      <span className={styles.tile}>
        <WarningIcon size={24} />
      </span>
      <span className={styles.title}>Something went wrong</span>
      <p className={styles.body}>
        The page could not be loaded. Flood reports already saved on this device
        are unaffected.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={reset}>
          Try again
        </button>
        <Link href="/dashboard" className={styles.secondary}>
          Back to the map
        </Link>
      </div>
    </div>
  )
}
