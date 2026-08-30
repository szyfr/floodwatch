"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  BellIcon,
  ClipboardTextIcon,
  GearIcon,
  GlobeIcon,
  KeyIcon,
  PlusIcon,
  SignOutIcon,
  StackIcon,
  UsersIcon,
  XIcon,
} from "@phosphor-icons/react"

import styles from "@/components/shell/nav-drawer.module.css"
import { LanguageToggle } from "@/components/shell/language-toggle"
import { useLanguage } from "@/components/providers/language-provider"
import type { SessionUserDto } from "@/lib/dto"

export type DrawerItem = {
  key: string
  href: string
  label: string
  badge?: number
}

export function NavDrawer({
  open,
  onClose,
  onChangePassword,
  user,
  items,
  currentKey,
}: {
  open: boolean
  onClose: () => void
  /** The drawer closes and the shell opens the dialog, which outlives it. */
  onChangePassword: () => void
  user: SessionUserDto | null
  items: DrawerItem[]
  currentKey: string
}) {
  const { t } = useLanguage()
  const router = useRouter()
  const panelRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    panelRef.current?.focus()
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const icons: Record<string, React.ReactNode> = {
    dashboard: <StackIcon size={20} />,
    submit: <PlusIcon size={20} />,
    alerts: <BellIcon size={20} />,
    reports: <ClipboardTextIcon size={20} />,
    users: <UsersIcon size={20} />,
    admin: <GearIcon size={20} />,
  }

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" })
    onClose()
    router.push("/signin")
    router.refresh()
  }

  return (
    <>
      <div className={styles.overlay} role="presentation" onClick={onClose} />
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={t.nav.map}
        tabIndex={-1}
      >
        <div className={styles.header}>
          <span className={styles.avatar} aria-hidden="true">
            {user?.initials ?? "··"}
          </span>
          <div className={styles.identity}>
            <span className={styles.name}>
              {user?.fullName ?? t.auth.signin}
            </span>
            <span className={styles.role}>
              {user ? t.roles[user.role] : t.auth.inSub}
            </span>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Close menu"
            onClick={onClose}
          >
            <XIcon size={19} weight="bold" />
          </button>
        </div>

        <div className={styles.languageRow}>
          <GlobeIcon size={17} />
          <LanguageToggle size="lg" />
        </div>

        <nav className={styles.nav}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`${styles.item} ${item.key === currentKey ? styles.itemActive : ""}`}
              onClick={() => {
                onClose()
                router.push(item.href)
              }}
            >
              {icons[item.key]}
              <span className={styles.itemLabel}>{item.label}</span>
              {item.badge ? (
                <span className={styles.badge}>{item.badge}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className={styles.footer}>
          {user ? (
            <>
              {/* Every account can change its own password, resident or
                  official — the console's reset is for somebody else's. */}
              <button
                type="button"
                className={styles.footerButton}
                onClick={onChangePassword}
              >
                <KeyIcon size={20} />
                {t.nav.password}
              </button>
              <button
                type="button"
                className={styles.footerButton}
                onClick={signOut}
              >
                <SignOutIcon size={20} />
                {t.nav.signout}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.footerButton}
              onClick={() => {
                onClose()
                router.push("/signin")
              }}
            >
              <SignOutIcon size={20} />
              {t.auth.signin}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
