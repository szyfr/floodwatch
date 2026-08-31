/**
 * The allowlist of push services this server will POST to.
 *
 * Load-bearing, not hygiene. The subscribe endpoint is unauthenticated by
 * design, and `endpoint` is a URL this process requests on every province-wide
 * broadcast. Without this check anyone could store a URL of their choosing and
 * have the origin fire thousands of authenticated-looking POSTs at it, from the
 * origin IP, on a schedule of their choosing.
 */
const HOSTS = [
  "android.googleapis.com",
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
] as const

/** Suffix matches, for the services that shard across subdomains. */
const SUFFIXES = [".push.services.mozilla.com", ".notify.windows.com"] as const

export function isKnownPushService(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== "https:") return false
  const host = url.hostname.toLowerCase()
  if (HOSTS.includes(host as (typeof HOSTS)[number])) return true
  return SUFFIXES.some((suffix) => host.endsWith(suffix))
}
