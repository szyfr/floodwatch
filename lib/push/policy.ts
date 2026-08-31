import type { AlertPriority, AlertType } from "@/lib/domain"

/**
 * What rings, for how long, and how loudly. Pure - no Prisma, no env - so the
 * rules can be read in one place instead of inferred from the dispatcher.
 */

/**
 * LOW is the one priority that does not push. This is the whole of the
 * channel-preservation policy, applied once, centrally, on the server.
 *
 * The alternative - a per-device priority floor with quiet hours - was left out
 * on purpose. Both are defaults that fail toward silence, and a resident who
 * never opens a settings sheet would have a HIGH flood warning suppressed at
 * 2am. In this province a HIGH flood warning at 2am is the message.
 */
export function shouldPush(alert: { priority: AlertPriority }): boolean {
  return alert.priority !== "LOW"
}

/**
 * How long a push service should hold an undelivered message for a phone that
 * is off the network.
 *
 * Set explicitly on every send because web-push's default is four weeks, and a
 * flood warning delivered next month is noise. Never 0, which tells the service
 * to drop the message unless the handset is connected at that instant.
 */
export function ttlSecondsFor(alert: {
  type: AlertType
  priority: AlertPriority
}): number {
  if (alert.type === "EVACUATION_ORDER" || alert.priority === "CRITICAL") {
    // A phone that regains signal two hours into a flood still needs the order.
    return 21_600
  }
  if (alert.priority === "HIGH") return 7_200
  return 3_600
}

export function urgencyFor(alert: {
  type: AlertType
  priority: AlertPriority
}): "normal" | "high" {
  if (alert.type === "EVACUATION_ORDER") return "high"
  return alert.priority === "CRITICAL" || alert.priority === "HIGH"
    ? "high"
    : "normal"
}
