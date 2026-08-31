/**
 * Browser-side push plumbing: what this device can do, and how it opts in.
 *
 * The support checks follow components/submit/locate-button.tsx's discipline,
 * for the same reason: a blocked permission, an absent API and an unsupported
 * platform each need a different answer, and collapsing them into one message
 * sends somebody hunting a prompt that will never appear.
 */
import { storePush, type PushRecord } from "@/lib/push/push-store"

/**
 * Why an unanswered prompt needs a deadline: on several Android browsers a
 * permission dialog the reader swipes away resolves NEITHER way, so without
 * this the switch spins for the rest of the session while still looking
 * pressable. Same trap locate-button.tsx documents for geolocation.
 */
const WATCHDOG_MS = 20_000

export type PushSupport =
  | "ready"
  | "insecure"
  | "ios-install"
  | "unsupported"
  | "denied"

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false
  // iPadOS reports itself as a Mac, and the touch points are the only tell.
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  )
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  const iosStandalone = (navigator as { standalone?: boolean }).standalone
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    iosStandalone === true
  )
}

/**
 * Order is load-bearing.
 *
 * The iOS branch MUST come before the generic feature check: navigator
 * .serviceWorker has existed in iOS Safari tabs since 11.3, so testing it alone
 * reports "supported" on every iPhone and then fails at subscribe time with
 * nothing on screen to explain it. PushManager and Notification are the real
 * discriminators, and on iOS they exist only inside a home-screen install.
 */
/**
 * Read through useSyncExternalStore, so the value is never computed during
 * render (it touches navigator and matchMedia) and never set from an effect
 * (react-hooks/set-state-in-effect is an error here).
 *
 * Support does not change for the life of the page, so nothing ever notifies:
 * subscribing is a no-op and the snapshot is memoised. Returning a fresh value
 * per call would loop useSyncExternalStore forever.
 */
let supportCache: PushSupport | null = null

export function subscribeSupport(): () => void {
  return () => {}
}

export function getSupport(): PushSupport {
  supportCache ??= describeSupport()
  return supportCache
}

/** null on the server: the toggle renders nothing until support is known. */
export function getServerSupport(): null {
  return null
}

export function describeSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported"
  // On a staging box over plain HTTP the APIs are absent, not blocked.
  if (!window.isSecureContext) return "insecure"
  if (isIos() && !isStandalone()) return "ios-install"
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported"
  }
  if (Notification.permission === "denied") return "denied"
  return "ready"
}

// Backed by an explicit ArrayBuffer: the bare `new Uint8Array(n)` overload
// widens to ArrayBufferLike, which no longer satisfies BufferSource.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(normalised)
  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

export type SubscribeFailure =
  | "denied"
  | "dismissed"
  | "timeout"
  | "noService"
  | "network"

export type SubscribeResult =
  | { ok: true; record: PushRecord }
  | { ok: false; reason: SubscribeFailure }

/**
 * Asks for permission, subscribes, and registers the device with the server.
 *
 * requestPermission() is the FIRST statement, before the service worker is
 * touched: Safari and iOS discard user activation across an await, so every
 * implementation that registers the worker first works on Android and fails
 * silently on iPhone.
 */
export async function subscribeDevice(input: {
  vapidPublicKey: string
  lgu: string
  language: string
}): Promise<SubscribeResult> {
  let permission: NotificationPermission
  try {
    permission = await Promise.race([
      Notification.requestPermission(),
      new Promise<NotificationPermission>((resolve) =>
        window.setTimeout(() => resolve("default"), WATCHDOG_MS)
      ),
    ])
  } catch {
    return { ok: false, reason: "denied" }
  }

  if (permission === "denied") return { ok: false, reason: "denied" }
  // "default" here is either a dismissed prompt or one the watchdog gave up on.
  // Both mean the same thing to the reader: nothing was decided, try again.
  if (permission !== "granted") return { ok: false, reason: "dismissed" }

  let subscription: PushSubscription
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      // The real defence against a stale worker, and independent of anything
      // the edge does: the browser bypasses its own HTTP cache for the script.
      updateViaCache: "none",
    })
    await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    subscription =
      existing ??
      (await registration.pushManager.subscribe({
        // Chrome rejects a subscription without this.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(input.vapidPublicKey),
      }))
  } catch {
    // A phone with no Play Services (Huawei since 2019, bare AOSP) rejects
    // subscribe() outright. The copy for this must not call the phone broken.
    return { ok: false, reason: "noService" }
  }

  const json = subscription.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!p256dh || !auth) return { ok: false, reason: "noService" }

  try {
    const response = await fetch("/api/push/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        p256dh,
        auth,
        lgu: input.lgu,
        language: input.language,
        userAgent: navigator.userAgent.slice(0, 400),
      }),
    })
    if (!response.ok) throw new Error(String(response.status))
  } catch {
    // Unlike the language PATCH, this is NOT fire-and-forget. A subscription
    // the server never stored is a phone that stays silent during an
    // evacuation, so the browser half is undone rather than left looking on.
    await subscription.unsubscribe().catch(() => {})
    return { ok: false, reason: "network" }
  }

  const record: PushRecord = {
    endpoint: subscription.endpoint,
    lgu: input.lgu,
    language: input.language,
  }
  storePush(record)
  return { ok: true, record }
}

/**
 * Turning off is the mirror image: honour the intent locally first, then tell
 * the server. An orphaned row is reaped by the next broadcast's 410, so a
 * failed DELETE is not worth blocking on.
 */
export async function unsubscribeDevice(): Promise<void> {
  let endpoint: string | null = null
  try {
    const registration = await navigator.serviceWorker.getRegistration("/")
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription) {
      endpoint = subscription.endpoint
      await subscription.unsubscribe()
    }
  } catch {
    /* nothing to unsubscribe from */
  }
  storePush(null)
  if (!endpoint) return
  await fetch("/api/push/subscription", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {})
}

/** Sends the one-off "it works" notification, best effort. */
export async function sendTestPush(endpoint: string): Promise<boolean> {
  try {
    const response = await fetch("/api/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    })
    return response.ok
  } catch {
    return false
  }
}
