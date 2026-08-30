import Link from "next/link"

import styles from "@/app/error.module.css"

export default function NotFound() {
  return (
    <div className={styles.wrap}>
      <span className={styles.title}>Page not found</span>
      <p className={styles.body}>
        That address does not exist. The live map covers all 22 cities and
        municipalities of Pampanga.
      </p>
      <div className={styles.actions}>
        <Link href="/dashboard" className={styles.primary}>
          Back to the map
        </Link>
      </div>
    </div>
  )
}
