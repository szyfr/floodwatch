"use client"

import { useRouter, useSearchParams } from "next/navigation"
import {
  MegaphoneSimpleIcon,
  PathIcon,
  ShieldIcon,
} from "@phosphor-icons/react"

import styles from "@/components/admin/admin-view.module.css"
import { BroadcastForm } from "@/components/admin/broadcast-form"
import { ZoneManager } from "@/components/admin/zone-manager"
import { useLanguage } from "@/components/providers/language-provider"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { LguDto, ZoneDto } from "@/lib/dto"

const ADMIN_TABS = ["broadcast", "zones", "routes"] as const

export type AdminTab = (typeof ADMIN_TABS)[number]

const TAB_ICONS = {
  broadcast: MegaphoneSimpleIcon,
  zones: ShieldIcon,
  routes: PathIcon,
} as const

export function AdminView({
  tab,
  lgus,
  zones,
  scopeSlug,
  placeSearch,
}: {
  tab: AdminTab
  lgus: LguDto[]
  zones: ZoneDto[]
  scopeSlug: string
  /** False when the server has no geocoder; the zone picker loses its search. */
  placeSearch: boolean
}) {
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()

  // The tab lives in the URL so an officer can send a colleague a link that
  // opens on the right panel, and so the back button walks through them.
  function selectTab(next: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", next)
    router.push(`/admin?${params}`)
  }

  const labels: Record<AdminTab, string> = {
    broadcast: t.admin.tabB,
    zones: t.admin.tabZ,
    routes: t.admin.tabR,
  }

  return (
    <div className={styles.page}>
      <div className={styles.column}>
        <div className={styles.heading}>
          <span className={styles.title}>{t.admin.title}</span>
          <span className={styles.subtitle}>{t.admin.sub}</span>
        </div>

        <Tabs
          className={styles.tabs}
          value={tab}
          onValueChange={(value) => {
            if (typeof value === "string") selectTab(value)
          }}
        >
          <TabsList className={styles.tabList}>
            {ADMIN_TABS.map((value) => {
              const Icon = TAB_ICONS[value]
              return (
                <TabsTrigger key={value} value={value} className={styles.tab}>
                  <Icon size={16} weight="regular" />
                  {labels[value]}
                </TabsTrigger>
              )
            })}
          </TabsList>

          {/* All three panels stay mounted: an officer who ducks into Safe
              zones to check a shelter must not lose a half-typed evacuation
              order. */}
          <TabsContent value={tab} className={styles.panel}>
            <div hidden={tab !== "broadcast"}>
              <BroadcastForm lgus={lgus} />
            </div>
            <div hidden={tab !== "zones"}>
              <ZoneManager
                lgus={lgus}
                zones={zones}
                scopeSlug={scopeSlug}
                placeSearch={placeSearch}
              />
            </div>
            {tab === "routes" ? (
              <div className={styles.routes}>
                <span className={styles.routesIcon}>
                  <PathIcon size={22} weight="regular" />
                </span>
                <span className={styles.routesTitle}>
                  {t.admin.routesEmpty}
                </span>
                <span className={styles.routesSub}>{t.admin.routesSub}</span>
                {/* Route drawing is phase 2; the control is shown, not offered. */}
                <Button
                  type="button"
                  variant="outline"
                  disabled
                  className={styles.drawButton}
                >
                  {t.admin.draw}
                </Button>
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
