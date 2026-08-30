"use client"

import styles from "@/components/shell/app-shell.module.css"
import { useLanguage } from "@/components/providers/language-provider"
import type { Language } from "@/lib/domain"

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "tl", label: "TL" },
]

export function LanguageToggle({ size = "sm" }: { size?: "sm" | "lg" }) {
  const { lang, setLang } = useLanguage()

  return (
    <div
      className={`${styles.langGroup} ${size === "lg" ? styles.langGroupLarge : ""}`}
      role="group"
      aria-label="Language"
    >
      {LANGUAGES.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={lang === option.value}
          className={`${styles.langButton} ${lang === option.value ? styles.langButtonOn : ""}`}
          onClick={() => setLang(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
