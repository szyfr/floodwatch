import styles from "@/components/auth/auth-form.module.css"
import { AuthChrome } from "@/components/auth/auth-chrome"

/**
 * Sign in and sign up sit outside the app shell - no header and no drawer -
 * but the design keeps the offline banner above every screen, auth included.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={styles.shell}>
      <AuthChrome />
      <main className={styles.page}>{children}</main>
    </div>
  )
}
