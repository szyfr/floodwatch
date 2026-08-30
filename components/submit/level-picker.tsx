"use client"

import styles from "@/components/submit/level-picker.module.css"
import { useLanguage } from "@/components/providers/language-provider"
import { LEVEL_META, WATER_LEVELS, type WaterLevel } from "@/lib/domain"

/**
 * "How deep is the water?" - the four water levels as a 2x2 grid of pressed
 * toggles. The chosen tile is outlined in its own level colour, which is the
 * same colour the report's pin will carry on the map.
 */
export function LevelPicker({
  value,
  onChange,
  labelledBy,
}: {
  value: WaterLevel | null
  onChange: (level: WaterLevel) => void
  /** id of the "How deep is the water?" label, so the four toggles read as one choice. */
  labelledBy?: string
}) {
  const { t } = useLanguage()

  return (
    <div className={styles.grid} role="group" aria-labelledby={labelledBy}>
      {WATER_LEVELS.map((code) => {
        const meta = LEVEL_META[code]
        const active = value === code
        return (
          <button
            key={code}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(code)}
            className={`${styles.option} ${active ? styles.optionActive : ""}`}
            style={active ? { borderColor: meta.color } : undefined}
          >
            <span className={styles.head}>
              <span
                className={styles.dot}
                style={{ background: meta.color, color: meta.fg }}
                aria-hidden="true"
              >
                {meta.letter}
              </span>
              <span className={styles.optionLabel}>{t.levels[code]}</span>
            </span>
            <span className={styles.optionHint}>{t.levelHints[code]}</span>
          </button>
        )
      })}
    </div>
  )
}
