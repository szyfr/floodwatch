"use client"

import * as React from "react"
import {
  CheckIcon,
  SpinnerIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"

import styles from "@/components/admin/broadcast-form.module.css"
import { useLanguage } from "@/components/providers/language-provider"
import { showToast } from "@/components/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ApiRequestError, api } from "@/lib/client-api"
import {
  ALERT_PRIORITIES,
  ALERT_TYPES,
  DESCRIPTION_MAX,
  PRIORITY_COLOR,
  formatCount,
  type AlertPriority,
  type AlertType,
} from "@/lib/domain"
import type { AlertScope, LguDto } from "@/lib/dto"

type Errors = { title: boolean; areas: boolean }

const NO_ERRORS: Errors = { title: false, areas: false }

/**
 * `crypto.randomUUID` is only defined in a secure context, and a DRRM desk may
 * well reach a staging box over plain HTTP. Same fallback as submit-form.tsx.
 */
function newClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

export function BroadcastForm({ lgus }: { lgus: LguDto[] }) {
  const { t } = useLanguage()
  const fieldId = React.useId()

  const [title, setTitle] = React.useState("")
  const [message, setMessage] = React.useState("")
  const [type, setType] = React.useState<AlertType>("FLOOD_WARNING")
  const [priority, setPriority] = React.useState<AlertPriority>("HIGH")
  const [scope, setScope] = React.useState<AlertScope>("PROVINCE")
  // Selection order, so the reach line reads back in the order they were picked.
  const [areas, setAreas] = React.useState<string[]>([])
  // Rotated after every successful send, so the next broadcast is a new alert
  // while a retry of THIS one collapses onto the row already written. A
  // double-tap used to be untidy; it now rings every phone in the province
  // twice, because two alert ids will not collapse under one notification tag.
  const clientId = React.useRef<string>(newClientId())
  const [sending, setSending] = React.useState(false)
  const [errors, setErrors] = React.useState<Errors>(NO_ERRORS)
  // Alternating so a second failed submit re-runs the shake animation.
  const [shakeAlt, setShakeAlt] = React.useState(false)

  const shake = shakeAlt ? styles.shakeB : styles.shakeA
  const critical = priority === "CRITICAL"

  const typeLabels = Object.fromEntries(
    ALERT_TYPES.map((value) => [value, t.type[value]])
  )
  const priorityLabels = Object.fromEntries(
    ALERT_PRIORITIES.map((value) => [value, t.prio[value]])
  )

  function toggleArea(slug: string) {
    setAreas((current) =>
      current.includes(slug)
        ? current.filter((s) => s !== slug)
        : [...current, slug]
    )
    setErrors((current) => ({ ...current, areas: false }))
  }

  const reachLine = (() => {
    if (scope === "PROVINCE") {
      const all = lgus.reduce((n, lgu) => n + lgu.registeredResidents, 0)
      return t.admin.reachAll.replace("{n}", formatCount(all))
    }
    if (areas.length === 0) return t.admin.reachNone
    const picked = areas
      .map((slug) => lgus.find((lgu) => lgu.slug === slug))
      .filter((lgu): lgu is LguDto => lgu !== undefined)
    const reached = picked.reduce((n, lgu) => n + lgu.registeredResidents, 0)
    return t.admin.reachSome
      .replace("{n}", formatCount(reached))
      .replace("{areas}", picked.map((lgu) => lgu.name).join(", "))
  })()

  async function submit() {
    const next: Errors = {
      title: !title.trim(),
      areas: scope === "AREAS" && areas.length === 0,
    }
    if (next.title || next.areas) {
      setErrors(next)
      setShakeAlt((value) => !value)
      return
    }

    setErrors(NO_ERRORS)
    setSending(true)
    try {
      await api.createAlert({
        title: title.trim(),
        message: message.trim(),
        type,
        priority,
        scope,
        areas: scope === "AREAS" ? areas : [],
        clientId: clientId.current,
      })
      // The type, priority and target survive: officers usually send several
      // alerts about the same event in a row.
      clientId.current = newClientId()
      setTitle("")
      setMessage("")
      showToast(t.toast.bcast, t.toast.bcastSub, "ok")
    } catch (error) {
      const fields = error instanceof ApiRequestError ? error.fields : {}
      const mapped: Errors = {
        title: "title" in fields,
        areas: "areas" in fields,
      }
      if (mapped.title || mapped.areas) {
        setErrors(mapped)
        setShakeAlt((value) => !value)
      } else {
        showToast(t.toast.error, t.toast.errorSub, "warn")
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.field}>
        <Label className={styles.label} htmlFor={`${fieldId}-title`}>
          {t.admin.bTitle}
        </Label>
        <Input
          id={`${fieldId}-title`}
          className={`${styles.input} ${errors.title ? styles.inputError : ""}`}
          value={title}
          placeholder={t.admin.bTitlePh}
          aria-invalid={errors.title}
          onChange={(event) => {
            setTitle(event.target.value)
            setErrors(NO_ERRORS)
          }}
        />
        {errors.title ? (
          <span className={`${styles.error} ${shake}`} role="alert">
            <WarningCircleIcon size={14} weight="bold" />
            {t.admin.errTitle}
          </span>
        ) : null}
      </div>

      <div className={styles.field}>
        <Label className={styles.label} htmlFor={`${fieldId}-message`}>
          {t.admin.bMsg}
        </Label>
        <Textarea
          id={`${fieldId}-message`}
          className={styles.textarea}
          value={message}
          rows={4}
          maxLength={DESCRIPTION_MAX}
          placeholder={t.admin.bMsgPh}
          onChange={(event) =>
            setMessage(event.target.value.slice(0, DESCRIPTION_MAX))
          }
        />
        <span className={styles.counter}>
          {message.length} / {DESCRIPTION_MAX}
        </span>
      </div>

      <div className={styles.row}>
        <div className={`${styles.field} ${styles.half}`}>
          <Label className={styles.label} htmlFor={`${fieldId}-type`}>
            {t.admin.bType}
          </Label>
          <Select
            items={typeLabels}
            value={type}
            onValueChange={(value) => {
              if (value !== null) setType(value)
            }}
          >
            <SelectTrigger id={`${fieldId}-type`} className={styles.select}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {ALERT_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t.type[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={`${styles.field} ${styles.half}`}>
          <Label className={styles.label} htmlFor={`${fieldId}-priority`}>
            {t.admin.bPrio}
          </Label>
          <Select
            items={priorityLabels}
            value={priority}
            onValueChange={(value) => {
              if (value !== null) setPriority(value)
            }}
          >
            <SelectTrigger id={`${fieldId}-priority`} className={styles.select}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {ALERT_PRIORITIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t.prio[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className={styles.target}>
        <span className={styles.label} id={`${fieldId}-target`}>
          {t.admin.bTarget}
        </span>
        <div
          role="group"
          className={styles.segments}
          aria-labelledby={`${fieldId}-target`}
        >
          {(["PROVINCE", "AREAS"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              variant="ghost"
              aria-pressed={scope === value}
              className={`${styles.segment} ${
                scope === value ? styles.segmentOn : ""
              }`}
              onClick={() => {
                setScope(value)
                setErrors((current) => ({ ...current, areas: false }))
              }}
            >
              {value === "PROVINCE" ? t.admin.tProvince : t.admin.tPick}
            </Button>
          ))}
        </div>

        {scope === "AREAS" ? (
          <>
            <div className={styles.chips}>
              {lgus.map((lgu) => {
                const on = areas.includes(lgu.slug)
                return (
                  <Button
                    key={lgu.slug}
                    type="button"
                    variant="ghost"
                    aria-pressed={on}
                    className={`${styles.chip} ${on ? styles.chipOn : ""}`}
                    onClick={() => toggleArea(lgu.slug)}
                  >
                    {on ? (
                      <CheckIcon
                        size={13}
                        weight="bold"
                        className={styles.chipCheck}
                      />
                    ) : null}
                    {lgu.name}
                  </Button>
                )
              })}
            </div>
            {errors.areas ? (
              <span className={`${styles.error} ${shake}`} role="alert">
                <WarningCircleIcon size={14} weight="bold" />
                {t.admin.errAreas}
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      <div
        className={`${styles.preview} ${critical ? styles.previewCritical : ""}`}
      >
        <span
          className={styles.previewDot}
          style={{ background: PRIORITY_COLOR[priority] }}
        />
        <span className={styles.previewLine}>
          {t.prio[priority]} · {t.type[type]}
        </span>
      </div>

      <div className={styles.send}>
        <Button
          type="button"
          className={`${styles.sendButton} ${critical ? styles.sendCritical : ""}`}
          disabled={sending}
          onClick={submit}
        >
          {sending ? (
            <SpinnerIcon size={18} weight="bold" className={styles.spinner} />
          ) : null}
          {sending ? t.admin.sending : t.admin.send}
        </Button>
        <span className={styles.reach}>{reachLine}</span>
        {/* Deliberately without a number. Lgu.registeredResidents above is
            seeded data, and replacing one false count with a second one is not
            the fix - a real subscriber count needs a delivery record this
            first cut does not keep. */}
        <span className={styles.reach}>{t.push.broadcastNote}</span>
      </div>
    </div>
  )
}
