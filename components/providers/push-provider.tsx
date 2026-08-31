"use client"

import * as React from "react"

import { useLanguage } from "@/components/providers/language-provider"
import { getStoredPush, storePush } from "@/lib/push/push-store"

/**
 * Keeps this device's stored subscription in step with the browser's.
 *
 * The backstop for two cases the service worker cannot cover. Safari does not
 * reliably fire pushsubscriptionchange, so an endpoint can rotate with nothing
 * telling the server; and a shared barangay phone needs to re-link to whoever
 * signed in last, which only a page load knows about.
 *
 * Deliberately silent. A 401 here after the 30-day session cookie lapses is
 * normal, and the reader is not the person who can act on any of it.
 */
export function PushProvider({ children }: { children: React.ReactNode }) {
  const { lang } = useLanguage()

  React.useEffect(() => {
    let cancelled = false

    async function reassert() {
      if (typeof window === "undefined") return
      if (!("serviceWorker" in navigator) || !("Notification" in window)) return
      if (Notification.permission !== "granted") return

      const stored = getStoredPush()
      if (!stored) return

      const registration = await navigator.serviceWorker.getRegistration("/")
      const subscription = await registration?.pushManager.getSubscription()
      if (cancelled) return

      if (!subscription) {
        // The browser dropped it while we were away. Clearing the local record
        // makes the drawer switch honest instead of claiming to be on.
        storePush(null)
        return
      }

      const drifted =
        subscription.endpoint !== stored.endpoint || stored.language !== lang
      if (!drifted) return

      const json = subscription.toJSON()
      const p256dh = json.keys?.p256dh
      const auth = json.keys?.auth
      if (!p256dh || !auth) return

      const response = await fetch("/api/push/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh,
          auth,
          lgu: stored.lgu,
          language: lang,
          previousEndpoint:
            subscription.endpoint !== stored.endpoint ? stored.endpoint : undefined,
        }),
      }).catch(() => null)
      if (cancelled || !response?.ok) return

      storePush({ endpoint: subscription.endpoint, lgu: stored.lgu, language: lang })
    }

    void reassert()
    return () => {
      cancelled = true
    }
  }, [lang])

  return <>{children}</>
}
