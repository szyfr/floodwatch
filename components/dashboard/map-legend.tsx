"use client"

import styles from "@/components/dashboard/map-legend.module.css"
import { useLanguage } from "@/components/providers/language-provider"
import { LEVEL_META, WATER_LEVELS } from "@/lib/domain"

/**
 * The map's key. The province view explains the bubble colours and adds the
 * river gauges; the LGU view explains the pins and adds the safe zones.
 */
export function MapLegend({ scope }: { scope: "province" | "lgu" }) {
  const { t } = useLanguage()
  const province = scope === "province"
  const extra = province
    ? { color: "#ea580c", label: t.gauge.title }
    : { color: "#16a34a", label: t.dash.safeZones }

  return (
    <div className={styles.legend}>
      <span className={styles.title}>
        {province ? t.dash.legendProvince : t.dash.legend}
      </span>
      {WATER_LEVELS.map((code) => (
        <div key={code} className={styles.row}>
          <span
            className={styles.dot}
            style={{ background: LEVEL_META[code].color }}
          />
          <span className={styles.label}>{t.levels[code]}</span>
        </div>
      ))}
      <div className={`${styles.row} ${styles.extraRow}`}>
        <span className={styles.square} style={{ background: extra.color }} />
        <span className={styles.label}>{extra.label}</span>
      </div>
    </div>
  )
}
