"use client"

import { XIcon } from "@phosphor-icons/react"

import styles from "@/components/shell/area-sheet.module.css"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useLanguage } from "@/components/providers/language-provider"
import { LEVEL_META } from "@/lib/domain"
import type { LguSummaryDto } from "@/lib/dto"

/**
 * "Choose an area" — the one place scope changes. Every surface follows the
 * selection, so it is chrome rather than a dashboard control.
 */
export function AreaSheet({
  open,
  onOpenChange,
  lgus,
  selectedSlug,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lgus: LguSummaryDto[]
  selectedSlug: string | null
  onSelect: (slug: string | null) => void
}) {
  const { t } = useLanguage()
  const provinceTotal = lgus.reduce((n, lgu) => n + lgu.reportCount, 0)

  const rows = [
    {
      slug: null as string | null,
      name: t.scope.all,
      count: provinceTotal,
      worst: null,
    },
    ...[...lgus]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((lgu) => ({
        slug: lgu.slug,
        name: lgu.name,
        count: lgu.reportCount,
        worst: lgu.worstLevel,
      })),
  ]

  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogContent className={styles.content} showCloseButton={false}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            <span className={styles.title}>{t.scope.pick}</span>
            <span className={styles.subtitle}>{t.scope.pickSub}</span>
          </div>
          <button
            type="button"
            className={styles.close}
            aria-label="Close"
            onClick={() => onOpenChange(false)}
          >
            <XIcon size={18} weight="bold" />
          </button>
        </div>

        <div className={styles.list}>
          {rows.map((row) => {
            const active = row.slug === selectedSlug
            const level = row.worst ? LEVEL_META[row.worst] : null
            return (
              <button
                key={row.slug ?? "province"}
                type="button"
                className={`${styles.item} ${active ? styles.itemActive : ""}`}
                onClick={() => {
                  onSelect(row.slug)
                  onOpenChange(false)
                }}
              >
                <span className={styles.label}>{row.name}</span>
                {row.count > 0 ? (
                  <span
                    className={styles.count}
                    style={{
                      background: level
                        ? level.color
                        : "var(--fw-border-softer)",
                      color: level ? level.fg : "var(--fw-fg-muted)",
                    }}
                  >
                    {row.count}
                  </span>
                ) : row.slug ? (
                  <span className={styles.quiet}>{t.lguPanel.none}</span>
                ) : null}
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
