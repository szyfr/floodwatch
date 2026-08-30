import { AppShell } from "@/components/shell/app-shell"
import { getSessionUser } from "@/lib/auth/session"
import { listAlerts, listLgus } from "@/lib/server/queries"

/**
 * Chrome shared by every signed-in surface: headers, the alert banner, the
 * offline banner and the navigation drawer. The alerts are read here so the
 * unread badge is correct on first paint rather than after a client fetch.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()
  const [alerts, lgus] = await Promise.all([
    listAlerts(user?.id ?? null),
    listLgus(),
  ])

  return (
    <AppShell user={user} initialAlerts={alerts} lgus={lgus}>
      {children}
    </AppShell>
  )
}
