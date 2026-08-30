"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import {
  CheckCircleIcon,
  ClockIcon,
  MapPinIcon,
  PencilSimpleIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  TrashIcon,
  UserIcon,
  XIcon,
} from "@phosphor-icons/react"

import {
  describeReport,
  minutesAgo,
  useCountBump,
} from "@/components/dashboard/report-card"
import styles from "@/components/dashboard/report-detail-dialog.module.css"
import { useLanguage } from "@/components/providers/language-provider"
import { showToast } from "@/components/toast"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { api } from "@/lib/client-api"
import { LEVEL_META, formatAgo, formatCoords } from "@/lib/domain"
import type { ReportDto, VoteValue } from "@/lib/dto"

type DetailProps = {
  report: ReportDto
  now: number
  onClose: () => void
  onVote: (report: ReportDto, direction: VoteValue) => void
  onDeleted: (id: string) => void
}

/** Opened from a card or a map pin; the URL carries `?report=<id>`. */
export function ReportDetailDialog({
  report,
  ...rest
}: Omit<DetailProps, "report"> & { report: ReportDto | null }) {
  if (!report) return null
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) rest.onClose()
      }}
    >
      <DialogContent className={styles.content} showCloseButton={false}>
        {/* Keyed so the vote counters do not pop when a different report
            takes over an open dialog. */}
        <DetailBody key={report.id} report={report} {...rest} />
      </DialogContent>
    </Dialog>
  )
}

function DetailBody({ report, now, onClose, onVote, onDeleted }: DetailProps) {
  const { t, lang } = useLanguage()
  const [deleting, setDeleting] = React.useState(false)
  const up = useCountBump(report.upvotes)
  const down = useCountBump(report.downvotes)

  const meta = LEVEL_META[report.waterLevel]
  const minutes = minutesAgo(now, report.createdAt)

  async function remove(id: string) {
    setDeleting(true)
    try {
      await api.deleteReport(id)
      showToast(t.toast.deleted, t.toast.deletedSub, "info")
      onDeleted(id)
    } catch {
      showToast(t.toast.error, t.toast.errorSub, "warn")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className={styles.head}>
        <div className={styles.headText}>
          <div className={styles.badges}>
            <span
              className={styles.level}
              style={{ background: meta.color, color: meta.fg }}
            >
              {t.levels[report.waterLevel]}
            </span>
            {report.verified ? (
              <span className={styles.verified}>
                <CheckCircleIcon size={14} weight="bold" />
                {t.report.verified}
              </span>
            ) : null}
          </div>
          <DialogTitle className={styles.name}>
            {report.locationName}
          </DialogTitle>
        </div>
        <button
          type="button"
          className={styles.close}
          aria-label="Close"
          onClick={onClose}
        >
          <XIcon size={18} weight="bold" />
        </button>
      </div>

      {/* The design shows the photo block only when there is one (line 868);
          a report without a photo shows nothing here at all. */}
      {report.photoUrl ? (
        <div className={styles.photo}>
          {/* Uploads keep whatever format the reporter sent, SVG included, so
              the optimiser is skipped rather than 400ing on the odd one. */}
          <Image
            src={report.photoUrl}
            alt={report.locationName}
            fill
            unoptimized
            sizes="(min-width: 768px) 452px, 100vw"
            className={styles.photoImage}
          />
        </div>
      ) : null}

      <span className={styles.desc}>{describeReport(report, lang)}</span>

      <div className={styles.meta}>
        <div className={styles.metaRow}>
          <ClockIcon size={15} />
          {formatAgo(minutes, lang)}
        </div>
        <div className={styles.metaRow}>
          <UserIcon size={15} />
          {`${t.report.reportedBy} · ${report.authorName ?? t.report.anon}`}
        </div>
        <div className={`${styles.metaRow} ${styles.metaCoords}`}>
          <MapPinIcon size={15} />
          {formatCoords(report.lat, report.lng)}
        </div>
      </div>

      <div className={styles.votes}>
        <button
          type="button"
          aria-label="Upvote"
          aria-pressed={report.myVote === "UP"}
          className={`${styles.vote} ${report.myVote === "UP" ? styles.voteUpOn : ""}`}
          onClick={() => onVote(report, "UP")}
        >
          <ThumbsUpIcon
            size={18}
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
            size={18}
            weight={report.myVote === "DOWN" ? "fill" : "regular"}
          />
          <span className={down.className} onAnimationEnd={down.onAnimationEnd}>
            {report.downvotes}
          </span>
        </button>
        {report.myVote ? (
          <span className={styles.voted}>{t.report.voted}</span>
        ) : null}
      </div>

      {report.isOwner ? (
        <div className={styles.owner}>
          <Link href={`/submit?edit=${report.id}`} className={styles.edit}>
            <PencilSimpleIcon size={15} />
            {t.report.edit}
          </Link>
          <button
            type="button"
            className={styles.delete}
            disabled={deleting}
            onClick={() => remove(report.id)}
          >
            <TrashIcon size={15} />
            {t.report.delete}
          </button>
        </div>
      ) : null}
    </>
  )
}
