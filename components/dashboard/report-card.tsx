"use client"

import * as React from "react"
import {
  CaretRightIcon,
  CheckCircleIcon,
  ClockIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "@phosphor-icons/react"

import styles from "@/components/dashboard/report-card.module.css"
import { useLanguage } from "@/components/providers/language-provider"
import {
  LEVEL_META,
  NEW_REPORT_MINUTES,
  formatAgo,
  type Language,
} from "@/lib/domain"
import type { ReportDto, VoteValue } from "@/lib/dto"

/**
 * Plays the design's 320ms count pop whenever a tally changes - but not on the
 * first paint, which would set every card animating at once.
 */
export function useCountBump(value: number): {
  className: string
  onAnimationEnd: () => void
} {
  const [bumping, setBumping] = React.useState(false)
  const previous = React.useRef(value)

  React.useEffect(() => {
    if (previous.current === value) return
    previous.current = value
    setBumping(true)
  }, [value])

  return {
    className: bumping ? styles.bump : "",
    onAnimationEnd: () => setBumping(false),
  }
}

/** Minutes between the view's clock and a report, never negative. */
export function minutesAgo(now: number, iso: string): number {
  return Math.max(0, Math.round((now - Date.parse(iso)) / 60000))
}

/** The reporter's own words, in the reader's language where there is one. */
export function describeReport(report: ReportDto, lang: Language): string {
  return ((lang === "tl" && report.descriptionTl) || report.description) ?? ""
}

export function ReportCard({
  report,
  now,
  onOpen,
  onVote,
}: {
  report: ReportDto
  now: number
  onOpen: (id: string) => void
  onVote: (report: ReportDto, direction: VoteValue) => void
}) {
  const { t, lang } = useLanguage()
  const minutes = minutesAgo(now, report.createdAt)
  const isNew = report.isNew && minutes < NEW_REPORT_MINUTES
  const meta = LEVEL_META[report.waterLevel]
  const up = useCountBump(report.upvotes)
  const down = useCountBump(report.downvotes)

  return (
    <div className={`${styles.card} ${isNew ? styles.cardNew : ""}`}>
      <div className={styles.head}>
        <span
          className={styles.level}
          style={{ background: meta.color, color: meta.fg }}
        >
          {t.levels[report.waterLevel]}
        </span>
        {isNew ? <span className={styles.new}>{t.report.new}</span> : null}
        {report.verified ? (
          <span className={styles.verified}>
            <CheckCircleIcon size={14} weight="bold" />
            {t.report.verified}
          </span>
        ) : null}
        <span className={styles.ago}>
          <ClockIcon size={13} />
          {formatAgo(minutes, lang)}
        </span>
      </div>

      <button
        type="button"
        className={styles.body}
        onClick={() => onOpen(report.id)}
      >
        <span className={styles.name}>{report.locationName}</span>
        <span className={styles.desc}>{describeReport(report, lang)}</span>
      </button>

      <div className={styles.actions}>
        <button
          type="button"
          aria-label="Upvote"
          aria-pressed={report.myVote === "UP"}
          className={`${styles.vote} ${report.myVote === "UP" ? styles.voteUpOn : ""}`}
          onClick={() => onVote(report, "UP")}
        >
          <ThumbsUpIcon
            size={16}
            weight={report.myVote === "UP" ? "fill" : "regular"}
          />
          <span className={up.className} onAnimationEnd={up.onAnimationEnd}>
            {report.upvotes}
          </span>
        </button>
        <button
          type="button"
          aria-label="Downvote"
          aria-pressed={report.myVote === "DOWN"}
          className={`${styles.vote} ${report.myVote === "DOWN" ? styles.voteDownOn : ""}`}
          onClick={() => onVote(report, "DOWN")}
        >
          <ThumbsDownIcon
            size={16}
            weight={report.myVote === "DOWN" ? "fill" : "regular"}
          />
          <span className={down.className} onAnimationEnd={down.onAnimationEnd}>
            {report.downvotes}
          </span>
        </button>
        {report.myVote ? (
          <span className={styles.voted}>{t.report.voted}</span>
        ) : null}
        <button
          type="button"
          className={styles.details}
          onClick={() => onOpen(report.id)}
        >
          {t.dash.details}
          <CaretRightIcon size={15} weight="bold" />
        </button>
      </div>
    </div>
  )
}
