"use client"

import { useId } from "react"
import { CaretRightIcon } from "@phosphor-icons/react"

import styles from "@/components/dashboard/province-panel.module.css"
import { useLanguage } from "@/components/providers/language-provider"
import {
  ALARM_COLOR,
  LEVEL_META,
  formatAgo,
  formatCount,
  levelRank,
  type AlarmLevel,
} from "@/lib/domain"
import type { EvacuationSummaryDto, GaugeDto, LguSummaryDto } from "@/lib/dto"

const SKELETONS = [1, 2, 3, 4]

/** Alarm-driven card colours, exactly as `gaugeCards` derives them. */
function gaugeTone(alarm: AlarmLevel): {
  background: string
  borderColor: string
} {
  if (alarm === "THIRD") {
    return {
      background: "var(--fw-danger-bg)",
      borderColor: "var(--fw-danger-border)",
    }
  }
  if (alarm === "SECOND") {
    return {
      background: "var(--fw-warn-bg)",
      borderColor: "var(--fw-warn-border)",
    }
  }
  return { background: "var(--fw-bg)", borderColor: "var(--fw-border-soft)" }
}

function barColour(percent: number): string {
  if (percent >= 90) return "var(--fw-danger)"
  if (percent >= 70) return "var(--fw-warn)"
  return "var(--fw-success)"
}

export function ProvincePanel({
  gauges,
  lgus,
  evacuation,
  loading,
  onSelectLgu,
}: {
  gauges: GaugeDto[]
  lgus: LguSummaryDto[]
  evacuation: EvacuationSummaryDto
  loading: boolean
  onSelectLgu: (slug: string) => void
}) {
  const { t, lang } = useLanguage()
  const evacTitleId = useId()

  if (loading) {
    return (
      <div className={styles.panel}>
        <div className={styles.skeleton}>
          <span className={styles.skeletonTitle} />
          {SKELETONS.map((key) => (
            <div key={key} className={styles.skeletonRow}>
              <span className={styles.skeletonBadge} />
              <div className={styles.skeletonText}>
                <span className={styles.skeletonLineA} />
                <span className={styles.skeletonLineB} />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Worst water first, then the busiest area, then the freshest report - the
  // order a duty officer reads the province in.
  const rows = lgus
    .flatMap((lgu) => {
      const worst = lgu.worstLevel
      if (!worst || lgu.reportCount === 0) return []
      return [{ lgu, worst, minutes: lgu.latestMinutesAgo ?? 0 }]
    })
    .sort(
      (a, b) =>
        levelRank(b.worst) - levelRank(a.worst) ||
        b.lgu.reportCount - a.lgu.reportCount ||
        a.minutes - b.minutes
    )
  const quiet = lgus.length - rows.length

  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <div className={styles.head}>
          <span className={styles.title}>{t.gauge.title}</span>
          <span className={styles.live}>
            <span className={styles.liveDot} />
            {t.dash.updated}
          </span>
        </div>
        {gauges.map((gauge) => (
          <div
            key={gauge.id}
            className={styles.gauge}
            style={gaugeTone(gauge.alarmLevel)}
          >
            <span
              className={styles.gaugeDot}
              style={{ background: ALARM_COLOR[gauge.alarmLevel] }}
            />
            <div className={styles.gaugeText}>
              <span className={styles.gaugeName}>{gauge.name}</span>
              <span className={styles.gaugeTrend}>
                {`${t.gauge[gauge.trend]} · ${gauge.deltaPerHour > 0 ? "+" : ""}${gauge.deltaPerHour.toFixed(2)} m/hr`}
              </span>
            </div>
            <div className={styles.gaugeReadout}>
              <span className={styles.gaugeReading}>
                {`${gauge.readingMetres.toFixed(1)} m`}
              </span>
              <span
                className={styles.gaugeAlarm}
                style={{ background: ALARM_COLOR[gauge.alarmLevel] }}
              >
                {t.gauge.alarm[gauge.alarmLevel]}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.evac}>
        <div className={styles.head}>
          <span className={styles.evacTitle} id={evacTitleId}>
            {t.evac.title}
          </span>
          <span className={styles.evacOpen}>
            {`${evacuation.openCentres} ${t.evac.open}`}
          </span>
        </div>
        <div
          className={styles.evacTrack}
          role="progressbar"
          aria-labelledby={evacTitleId}
          aria-valuenow={evacuation.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={styles.evacFill}
            style={{
              width: `${evacuation.percent}%`,
              background: barColour(evacuation.percent),
            }}
          />
        </div>
        <span className={styles.evacUsed}>
          {`${formatCount(evacuation.occupancy)} / ${formatCount(evacuation.capacity)} ${t.evac.used} · ${evacuation.percent}%`}
        </span>
      </div>

      <div className={styles.rows}>
        <div className={styles.head}>
          <span className={styles.title}>{t.lguPanel.title}</span>
          <span className={styles.count}>
            {`${rows.length} / ${lgus.length} ${t.lguPanel.reporting}`}
          </span>
        </div>
        {rows.map(({ lgu, worst, minutes }) => (
          <button
            key={lgu.id}
            type="button"
            className={styles.row}
            onClick={() => onSelectLgu(lgu.slug)}
          >
            <span
              className={styles.rowBadge}
              style={{
                background: LEVEL_META[worst].color,
                color: LEVEL_META[worst].fg,
              }}
            >
              {lgu.reportCount}
            </span>
            <span className={styles.rowText}>
              <span className={styles.rowName}>{lgu.name}</span>
              <span className={styles.rowMeta}>
                {`${t.lguPanel.worst} ${t.levels[worst]} · ${t.lguPanel.latest} ${formatAgo(minutes, lang)}`}
              </span>
            </span>
            <CaretRightIcon
              size={16}
              weight="bold"
              className={styles.rowCaret}
            />
          </button>
        ))}
        {quiet > 0 ? (
          <span className={styles.rest}>{`${quiet} ${t.lguPanel.rest}`}</span>
        ) : null}
      </div>
    </div>
  )
}
