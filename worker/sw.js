/**
 * Push-only service worker.
 *
 * Plain JavaScript on purpose. `app/sw.ts` is not a Next file convention and
 * would be an unrouted stray file, and a `worker/sw.ts` fails `bun run
 * typecheck`: the root tsconfig includes every .ts, and typing
 * ServiceWorkerGlobalScope needs lib "webworker", which collides with the
 * "dom" lib the app requires. A .js file is invisible to tsc.
 *
 * There is NO fetch handler and no precaching, deliberately. This app already
 * queues reports offline through lib/offline-store.ts, and a precached shell is
 * how an app ends up serving yesterday's flood map to someone standing in
 * today's water.
 */

self.addEventListener("install", () => {
  // A new worker takes over at once. Waiting for every tab to close means a
  // fixed delivery bug ships to a phone days after the fix.
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }

  // ALWAYS show something. Chrome grants a silent-push budget, and once it is
  // spent it posts its own "this site has been updated in the background"
  // notice - which is strictly worse than a generic title of ours.
  const title = data.title || "Pampanga Flood Watch"
  const critical = data.priority === "CRITICAL"

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Open Flood Watch for the latest alert.",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      lang: data.lang || "en",
      // At-least-once delivery means the same alert can arrive twice. Tagging
      // on the alert id makes the second replace the first instead of stacking.
      tag: "fw-alert-" + (data.id || "unknown"),
      renotify: critical,
      requireInteraction: critical,
      data: { url: data.url || "/alerts", id: data.id || null },
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || "/alerts"

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            // During a flood the open tab is the live map, and replacing it
            // with a cold load is the opposite of helpful.
            if ("navigate" in client) client.navigate(target)
            return client.focus()
          }
        }
        return self.clients.openWindow(target)
      })
  )
})

self.addEventListener("pushsubscriptionchange", (event) => {
  // The browser rotated the endpoint. Re-subscribe with the same key and tell
  // the server which row this replaces: the area and language are inherited
  // server-side from that row, because a worker has no access to the app's
  // stores and guessing an area here would silently re-target the device.
  //
  // A same-origin fetch from a worker sends Sec-Fetch-Site: same-origin, so
  // proxy.ts's cross-site check lets it pass.
  const old = event.oldSubscription
  const applicationServerKey =
    (old && old.options && old.options.applicationServerKey) || null
  if (!applicationServerKey) return

  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey })
      .then((subscription) => {
        const json = subscription.toJSON()
        return fetch("/api/push/subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            p256dh: json.keys && json.keys.p256dh,
            auth: json.keys && json.keys.auth,
            previousEndpoint: old ? old.endpoint : undefined,
          }),
        })
      })
      .catch(() => {})
  )
})
