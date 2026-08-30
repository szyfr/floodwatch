"use client"

import { OfflineBanner } from "@/components/shell/offline-banner"
import { useOnline } from "@/hooks/use-online"

/** The only piece of app chrome the auth screens carry. */
export function AuthChrome() {
  const online = useOnline()
  return online ? null : <OfflineBanner />
}
