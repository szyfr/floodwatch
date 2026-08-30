"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  BellIcon,
  CaretDownIcon,
  ListIcon,
  MapPinIcon,
  PlusIcon,
  WarningIcon,
  WifiSlashIcon,
  XIcon,
} from "@phosphor-icons/react"

import { CriticalAlertGate } from "@/components/alerts/critical-alert-gate"
import styles from "@/components/shell/app-shell.module.css"
import { AreaSheet } from "@/components/shell/area-sheet"
import { LanguageToggle } from "@/components/shell/language-toggle"
import { NavDrawer, type DrawerItem } from "@/components/shell/nav-drawer"
import { OfflineBanner } from "@/components/shell/offline-banner"
import { showToast } from "@/components/toast"
import { useLanguage } from "@/components/providers/language-provider"
import { useSocketEvent } from "@/components/providers/socket-provider"
import { useOfflineQueue } from "@/hooks/use-offline-queue"
import { useOnline } from "@/hooks/use-online"
import {
  dismissAlertLocally,
  getDismissed,
  getServerDismissed,
  subscribeDismissed,
} from "@/lib/alerts-store"
import { PRIORITY_COLOR } from "@/lib/domain"
import type { AlertDto, LguDto, LguSummaryDto, SessionUserDto } from "@/lib/dto"

function sectionOf(pathname: string): string {
  if (pathname.startsWith("/submit")) return "submit"
  if (pathname.startsWith("/alerts")) return "alerts"
  if (pathname.startsWith("/admin")) return "admin"
  return "dashboard"
}

export function AppShell({
  user,
  initialAlerts,
  lgus,
  children,
}: {
  user: SessionUserDto | null
  initialAlerts: AlertDto[]
  lgus: LguDto[]
  children: React.ReactNode
}) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Alerts that arrived over the socket after this page was rendered, plus the
  // ids this viewer has cleared. Both are merged with the server list during
  // render rather than copied into state, so a navigation cannot show a stale
  // banner.
  const [liveAlerts, setLiveAlerts] = React.useState<AlertDto[]>([])
  const dismissedIds = React.useSyncExternalStore(
    subscribeDismissed,
    getDismissed,
    getServerDismissed
  )
  const [bannerDismissed, setBannerDismissed] = React.useState(false)
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [areaOpen, setAreaOpen] = React.useState(false)
  const [areaRows, setAreaRows] = React.useState<LguSummaryDto[]>(() =>
    lgus.map((lgu) => ({
      ...lgu,
      reportCount: 0,
      worstLevel: null,
      latestMinutesAgo: null,
    }))
  )

  const online = useOnline()
  const { queuedCount } = useOfflineQueue(online, () => {
    showToast(t.toast.synced, t.toast.syncedSub, "ok")
    router.refresh()
  })

  // A new broadcast has to reach people who are already looking at the app.
  useSocketEvent("alert:created", (alert) => {
    setLiveAlerts((current) =>
      current.some((a) => a.id === alert.id) ? current : [alert, ...current]
    )
    setBannerDismissed(false)
  })

  const section = sectionOf(pathname)
  const scopeSlug = searchParams.get("lgu")
  const scopeLgu = scopeSlug
    ? lgus.find((lgu) => lgu.slug === scopeSlug)
    : undefined
  const scopeLine = scopeLgu ? `${scopeLgu.name}, Pampanga` : t.place

  // The layout cannot see searchParams, so scope is applied here: an area-
  // targeted alert only counts while the viewer is looking at that area.
  const live = React.useMemo(() => {
    const known = new Set(initialAlerts.map((alert) => alert.id))
    return [
      ...liveAlerts.filter((alert) => !known.has(alert.id)),
      ...initialAlerts,
    ]
      .filter((alert) => !alert.dismissed && !dismissedIds.has(alert.id))
      .filter(
        (alert) =>
          !scopeSlug ||
          alert.scope === "PROVINCE" ||
          alert.areas.some((area) => area.slug === scopeSlug)
      )
  }, [initialAlerts, liveAlerts, dismissedIds, scopeSlug])
  const unread = live.length
  const banner = live[0]

  // "The map, reports and alerts follow this choice" — so the chosen area
  // travels with every navigation instead of resetting at each screen.
  const withScope = (href: string) =>
    scopeSlug ? `${href}?lgu=${scopeSlug}` : href

  const navItems: DrawerItem[] = [
    { key: "dashboard", href: withScope("/dashboard"), label: t.nav.map },
    { key: "submit", href: withScope("/submit"), label: t.nav.submit },
    {
      key: "alerts",
      href: withScope("/alerts"),
      label: t.nav.alerts,
      badge: unread || undefined,
    },
    ...(user?.role === "OFFICIAL"
      ? [{ key: "admin", href: withScope("/admin"), label: t.nav.panel }]
      : []),
  ]
  const desktopNav = navItems.filter((item) => item.key !== "submit")

  async function openAreaSheet() {
    setAreaOpen(true)
    try {
      const response = await fetch("/api/lgus")
      if (!response.ok) return
      const data = (await response.json()) as { lgus: LguSummaryDto[] }
      setAreaRows(data.lgus)
    } catch {
      /* the sheet still lists every area, just without counts */
    }
  }

  function selectArea(slug: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (slug) params.set("lgu", slug)
    else params.delete("lgu")
    params.delete("report")
    router.push(`/dashboard${params.size ? `?${params}` : ""}`)
  }

  async function dismissBanner(event: React.MouseEvent) {
    event.stopPropagation()
    if (!banner) return
    setBannerDismissed(true)
    dismissAlertLocally(banner.id)
    if (!user) return
    await fetch(`/api/alerts/${banner.id}/dismiss`, { method: "POST" }).catch(
      () => {}
    )
  }

  const bannerTitle = banner
    ? (lang === "tl" && banner.titleTl) || banner.title
    : ""
  const bannerMessage = banner
    ? (lang === "tl" && banner.messageTl) || banner.message
    : ""

  return (
    <div className={styles.shell}>
      <header className={styles.mobileHeader}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
        >
          <ListIcon size={22} />
        </button>
        <div className={styles.titleBlock}>
          <span className={styles.brand}>{t.brand}</span>
          <button
            type="button"
            className={styles.scopeButton}
            onClick={openAreaSheet}
          >
            <span>{scopeLine}</span>
            <CaretDownIcon size={13} weight="bold" />
          </button>
        </div>
        <Link
          href={withScope("/alerts")}
          className={`${styles.iconButton} ${styles.bellWrap}`}
          aria-label={t.nav.alerts}
        >
          <BellIcon size={21} />
          {unread > 0 ? (
            <span className={styles.bellBadge}>{unread}</span>
          ) : null}
        </Link>
      </header>

      <header className={styles.desktopHeader}>
        <Link href={withScope("/dashboard")} className={styles.brandBlock}>
          <span className={styles.mark}>
            <MapPinIcon size={19} />
          </span>
          <span className={styles.titleBlock}>
            <span className={styles.brand}>{t.brand}</span>
            <span className={styles.brandScope}>{scopeLine}</span>
          </span>
        </Link>

        <nav className={styles.nav}>
          {desktopNav.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`${styles.navItem} ${item.key === section ? styles.navItemActive : ""}`}
            >
              {item.label}
              {item.badge ? (
                <span className={styles.navBadge}>{item.badge}</span>
              ) : null}
            </Link>
          ))}
        </nav>

        <div className={styles.headerRight}>
          {!online ? (
            <span className={styles.offlineChip}>
              <WifiSlashIcon size={14} weight="bold" />
              {t.offline.chip}
            </span>
          ) : null}
          <LanguageToggle />
          <Link
            href={withScope("/submit")}
            className={`${styles.navItem} ${styles.submitButton}`}
          >
            <PlusIcon size={17} weight="bold" />
            {t.nav.submit}
          </Link>
          <button
            type="button"
            className={styles.avatarButton}
            aria-label="Account menu"
            onClick={() => setDrawerOpen(true)}
          >
            {user?.initials ?? "··"}
          </button>
        </div>
      </header>

      {!online ? <OfflineBanner queuedCount={queuedCount} /> : null}

      {banner && !bannerDismissed ? (
        <div className={styles.alertBannerWrap}>
          <div
            role="button"
            tabIndex={0}
            className={`${styles.alertBanner} ${
              banner.priority === "CRITICAL" ? styles.alertBannerCritical : ""
            }`}
            style={{ borderLeftColor: PRIORITY_COLOR[banner.priority] }}
            onClick={() => router.push(withScope("/alerts"))}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ")
                router.push(withScope("/alerts"))
            }}
          >
            <WarningIcon
              size={19}
              className={styles.alertBannerIcon}
              color={PRIORITY_COLOR[banner.priority]}
            />
            <div className={styles.alertBannerBody}>
              <div className={styles.alertBannerHead}>
                <span
                  className={styles.priorityPill}
                  style={{ background: PRIORITY_COLOR[banner.priority] }}
                >
                  {t.prio[banner.priority]}
                </span>
                <span className={styles.alertBannerTitle}>{bannerTitle}</span>
              </div>
              <span className={styles.alertBannerMessage}>{bannerMessage}</span>
            </div>
            <button
              type="button"
              className={styles.dismissButton}
              aria-label="Dismiss alert"
              onClick={dismissBanner}
            >
              <XIcon size={15} weight="bold" />
            </button>
          </div>
        </div>
      ) : null}

      <main className={styles.main}>{children}</main>

      <NavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={user}
        items={navItems}
        currentKey={section}
      />

      <AreaSheet
        open={areaOpen}
        onOpenChange={setAreaOpen}
        lgus={areaRows}
        selectedSlug={scopeSlug}
        onSelect={selectArea}
      />

      {/* An evacuation order has to interrupt whatever screen you are on. */}
      <CriticalAlertGate alerts={live} />
    </div>
  )
}
