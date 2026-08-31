import { AppShell } from "@/components/shell/app-shell"
import { getSessionUser } from "@/lib/auth/session"
import { publicVapidKey } from "@/lib/push/vapid"
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
    <AppShell
      user={user}
      initialAlerts={alerts}
      lgus={lgus}
      // Read per request rather than through a NEXT_PUBLIC_ variable, which is
      // inlined at build time - and a build never runs server.ts. This shell is
      // already dynamic (getSessionUser awaits cookies), so it costs nothing,
      // and rotating the key is a restart instead of a rebuild.
      vapidPublicKey={publicVapidKey()}
    >
      {children}
    </AppShell>
  )
}
