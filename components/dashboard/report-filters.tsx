"use client"

import styles from "@/components/dashboard/report-filters.module.css"
import { useLanguage } from "@/components/providers/language-provider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  LEVEL_META,
  RECENCY_OPTIONS,
  SORT_OPTIONS,
  WATER_LEVELS,
  type Recency,
  type SortOption,
  type WaterLevel,
} from "@/lib/domain"

export function ReportFilters({
  count,
  loading,
  level,
  recency,
  sort,
  onLevelChange,
  onRecencyChange,
  onSortChange,
}: {
  count: number
  loading: boolean
  level: WaterLevel | null
  recency: Recency
  sort: SortOption
  onLevelChange: (level: WaterLevel | null) => void
  onRecencyChange: (recency: Recency) => void
  onSortChange: (sort: SortOption) => void
}) {
  const { t } = useLanguage()

  const recencyLabels: Record<Recency, string> = {
    "30": t.recency["30"],
    "60": t.recency["60"],
    "1440": t.recency["1440"],
    all: t.recency.all,
  }
  const sortLabels: Record<SortOption, string> = {
    recent: t.sortOpts.recent,
    voted: t.sortOpts.voted,
  }

  return (
    <div className={styles.filters}>
      <div className={styles.head}>
        <span className={styles.title}>{t.dash.live}</span>
        <span className={styles.live}>
          <span className={styles.liveDot} />
          {t.dash.updated}
        </span>
        <span className={styles.count}>
          {loading ? "-" : `${count} ${t.dash.reports}`}
        </span>
      </div>

      <div className={styles.chips}>
        <button
          type="button"
          aria-pressed={level === null}
          className={`${styles.chip} ${level === null ? styles.chipActive : ""}`}
          onClick={() => onLevelChange(null)}
        >
          {t.dash.all}
        </button>
        {WATER_LEVELS.map((code) => (
          <button
            key={code}
            type="button"
            aria-pressed={level === code}
            className={`${styles.chip} ${level === code ? styles.chipActive : ""}`}
            onClick={() => onLevelChange(code)}
          >
            <span
              className={styles.chipDot}
              style={{ background: LEVEL_META[code].color }}
            />
            {t.levels[code]}
          </button>
        ))}
      </div>

      <div className={styles.selects}>
        <Select
          items={recencyLabels}
          value={recency}
          onValueChange={(value) => {
            if (value) onRecencyChange(value)
          }}
        >
          <SelectTrigger
            className={styles.select}
            aria-label={t.dash.filterTime}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={styles.popup} alignItemWithTrigger={false}>
            {RECENCY_OPTIONS.map((option) => (
              <SelectItem key={option} value={option} className={styles.option}>
                {recencyLabels[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          items={sortLabels}
          value={sort}
          onValueChange={(value) => {
            if (value) onSortChange(value)
          }}
        >
          <SelectTrigger
            className={styles.select}
            aria-label={t.dash.filterSort}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={styles.popup} alignItemWithTrigger={false}>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option} value={option} className={styles.option}>
                {sortLabels[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
