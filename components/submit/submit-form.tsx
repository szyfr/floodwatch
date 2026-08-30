"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeftIcon,
  CircleNotchIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"

import { FloodMap, type MapPoint } from "@/components/map/flood-map"
import { useLanguage } from "@/components/providers/language-provider"
import { LevelPicker } from "@/components/submit/level-picker"
import {
  PhotoUpload,
  type AttachedPhoto,
} from "@/components/submit/photo-upload"
import styles from "@/components/submit/submit-form.module.css"
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
import { enqueueReport } from "@/lib/offline-store"
import { useOnline } from "@/hooks/use-online"
import { api, ApiRequestError } from "@/lib/client-api"
import {
  DESCRIPTION_MAX,
  PICKER_ZOOM,
  PROVINCE_CENTER,
  type WaterLevel,
} from "@/lib/domain"
import type { LguDto, ReportDto, ZoneDto } from "@/lib/dto"
import type { UpdateReportInput } from "@/lib/validation"

/** The design shows exactly three inline errors; everything else is a toast. */
type ErrorSlot = "name" | "level" | "pin"
type Errors = Partial<Record<ErrorSlot, boolean>>

/**
 * Server field errors reach the same three slots. `fields` maps a field name
 * to a dictionary key, so either half can name the slot.
 */
const SLOT_OF: Record<string, ErrorSlot> = {
  name: "name",
  locationName: "name",
  level: "level",
  waterLevel: "level",
  pin: "pin",
  lat: "pin",
  lng: "pin",
}

function slotsFor(fields: Record<string, string>): ErrorSlot[] {
  const slots = new Set<ErrorSlot>()
  for (const [field, key] of Object.entries(fields)) {
    const slot = SLOT_OF[key] ?? SLOT_OF[field]
    if (slot) slots.add(slot)
  }
  return [...slots]
}

function parsePoint(lat: string, lng: string): MapPoint | null {
  const a = Number(lat.trim())
  const b = Number(lng.trim())
  if (!lat.trim() || !lng.trim() || !Number.isFinite(a) || !Number.isFinite(b))
    return null
  if (a < -90 || a > 90 || b < -180 || b > 180) return null
  return { lat: a, lng: b }
}

/**
 * `crypto.randomUUID` is only defined in a secure context, and a barangay
 * device may well reach a staging box over plain HTTP.
 */
function newClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

function ErrorLine({ text, shake }: { text: string; shake: string }) {
  return (
    <span className={`${styles.error} ${shake}`} role="alert">
      <WarningCircleIcon size={14} weight="bold" className={styles.errorIcon} />
      {text}
    </span>
  )
}

export function SubmitForm({
  lgus,
  report,
  presetLguSlug,
  defaultLguSlug,
}: {
  lgus: LguDto[]
  /** Non-null in edit mode — the viewer's own report, prefilled. */
  report: ReportDto | null
  presetLguSlug: string | null
  defaultLguSlug: string
}) {
  const { t } = useLanguage()
  const router = useRouter()
  const online = useOnline()

  const sorted = React.useMemo(
    () => [...lgus].sort((a, b) => a.name.localeCompare(b.name)),
    [lgus]
  )
  const items = React.useMemo(
    () => sorted.map((lgu) => ({ label: lgu.name, value: lgu.slug })),
    [sorted]
  )

  const [lguSlug, setLguSlug] = React.useState(() => {
    const preset =
      presetLguSlug && lgus.some((lgu) => lgu.slug === presetLguSlug)
    return report?.lguSlug ?? (preset ? presetLguSlug : defaultLguSlug)
  })
  const [locationName, setLocationName] = React.useState(
    report?.locationName ?? ""
  )
  const [description, setDescription] = React.useState(
    report?.description ?? ""
  )
  const [level, setLevel] = React.useState<WaterLevel | null>(
    report?.waterLevel ?? null
  )
  const [lat, setLat] = React.useState(report ? report.lat.toFixed(5) : "")
  const [lng, setLng] = React.useState(report ? report.lng.toFixed(5) : "")
  const [photo, setPhoto] = React.useState<AttachedPhoto | null>(() =>
    report?.photoUrl
      ? {
          url: report.photoUrl,
          name: report.photoUrl.split("/").pop() ?? "",
          size: null,
        }
      : null
  )
  const [zones, setZones] = React.useState<ZoneDto[]>([])
  const [errors, setErrors] = React.useState<Errors>({})
  const [shakeAlt, setShakeAlt] = React.useState(false)
  const [sending, setSending] = React.useState(false)

  // One id per form session: it makes both the online POST and a queued retry
  // idempotent, so a lost response cannot become two reports.
  const clientId = React.useRef<string>(newClientId())

  /** Back to a blank slate, keeping the area so a second report is quick. */
  const resetForm = React.useCallback(() => {
    setLocationName("")
    setDescription("")
    setLevel(null)
    setLat("")
    setLng("")
    setPhoto(null)
    setErrors({})
  }, [])

  // Safe zones give the picker map the same landmarks the dashboard shows.
  React.useEffect(() => {
    let cancelled = false
    api
      .zones(lguSlug)
      .then((data) => {
        if (!cancelled) setZones(data.zones)
      })
      .catch(() => {
        /* the pin can still be dropped without them */
      })
    return () => {
      cancelled = true
    }
  }, [lguSlug])

  const point = parsePoint(lat, lng)
  const area = lgus.find((lgu) => lgu.slug === lguSlug)
  const focus = area
    ? { lat: area.lat, lng: area.lng, zoom: PICKER_ZOOM }
    : { lat: PROVINCE_CENTER.lat, lng: PROVINCE_CENTER.lng, zoom: 11 }
  const complete = Boolean(locationName.trim() && level && point)
  const shake = shakeAlt ? styles.shakeB : styles.shakeA

  function clearError(slot: ErrorSlot) {
    setErrors((current) =>
      current[slot] ? { ...current, [slot]: false } : current
    )
  }

  function fail(next: Errors) {
    setErrors(next)
    setShakeAlt((alt) => !alt)
  }

  function pickPoint(next: MapPoint) {
    setLat(next.lat.toFixed(5))
    setLng(next.lng.toFixed(5))
    clearError("pin")
  }

  /** Only what the author actually touched, so an untouched field is left alone. */
  function changesFor(
    current: ReportDto,
    values: {
      locationName: string
      description: string
      level: WaterLevel
      point: MapPoint
    }
  ): UpdateReportInput {
    const changes: UpdateReportInput = {}
    if (values.locationName !== current.locationName)
      changes.locationName = values.locationName
    if ((values.description || null) !== current.description)
      changes.description = values.description || null
    if (values.level !== current.waterLevel) changes.waterLevel = values.level
    if (values.point.lat !== Number(current.lat.toFixed(5)))
      changes.lat = values.point.lat
    if (values.point.lng !== Number(current.lng.toFixed(5)))
      changes.lng = values.point.lng
    if (lguSlug !== current.lguSlug) changes.lguSlug = lguSlug
    if ((photo?.url ?? null) !== current.photoUrl)
      changes.photoUrl = photo?.url ?? null
    return changes
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending) return

    const name = locationName.trim()
    if (!name || !level || !point) {
      fail({ name: !name, level: !level, pin: !point })
      return
    }

    setErrors({})
    setSending(true)

    const text = description.trim()

    // An edit has to reach the server — there is no sensible way to queue a
    // change to a row other people are already voting on — so say so plainly
    // rather than letting the fetch fail into a generic error.
    if (!online && report) {
      setSending(false)
      showToast(t.toast.error, t.submit.queue, "warn")
      return
    }

    // A new report, on the other hand, can wait in the queue.
    if (!online) {
      enqueueReport({
        clientId: clientId.current,
        lguSlug,
        locationName: name,
        description: text,
        waterLevel: level,
        lat: point.lat,
        lng: point.lng,
        photoUrl: photo?.url ?? null,
      })
      showToast(t.toast.queued, t.toast.queuedSub, "warn")
      // No navigation while offline: the router would have to fetch the next
      // route from the server and the browser would land on its own network
      // error page. Clearing the form in place keeps the app usable, which is
      // the whole point of queueing.
      resetForm()
      setSending(false)
      return
    }

    try {
      let destination: string
      if (report) {
        const changes = changesFor(report, {
          locationName: name,
          description: text,
          level,
          point,
        })
        if (Object.keys(changes).length > 0)
          await api.updateReport(report.id, changes)
        destination = `/dashboard?lgu=${report.lguSlug}&report=${report.id}`
      } else {
        const created = await api.createReport({
          clientId: clientId.current,
          lguSlug,
          locationName: name,
          description: text,
          waterLevel: level,
          lat: point.lat,
          lng: point.lng,
          photoUrl: photo?.url ?? null,
        })
        destination = `/dashboard?lgu=${created.report.lguSlug}`
      }
      showToast(t.toast.sent, t.toast.sentSub, "ok")
      router.push(destination)
      router.refresh()
    } catch (error) {
      setSending(false)
      const slots =
        error instanceof ApiRequestError ? slotsFor(error.fields) : []
      if (slots.length > 0) {
        const next: Errors = {}
        for (const slot of slots) next[slot] = true
        fail(next)
        return
      }
      showToast(t.toast.error, t.toast.errorSub, "warn")
    }
  }

  return (
    <form className={styles.page} onSubmit={submit} noValidate>
      <div className={styles.header}>
        <Link href="/dashboard" aria-label="Back" className={styles.back}>
          <ArrowLeftIcon size={18} />
        </Link>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{t.submit.title}</h1>
          <span className={styles.subtitle}>{t.submit.sub}</span>
        </div>
      </div>

      <div className={styles.card}>
        <div className={`${styles.section} ${styles.sectionWhere}`}>
          <span className={styles.label}>{t.submit.where}</span>
          <div
            className={`${styles.mapBox} ${errors.pin ? styles.mapBoxError : ""}`}
          >
            <FloodMap
              mode="picker"
              level="lgu"
              focus={focus}
              zones={zones}
              labels={false}
              pickedPoint={point}
              onPick={pickPoint}
            />
          </div>
          <span className={styles.hint}>{t.submit.mapHint}</span>
          <div className={styles.coords}>
            <div className={styles.coord}>
              <Label htmlFor="f-lat" className={styles.coordLabel}>
                {t.submit.lat}
              </Label>
              <Input
                id="f-lat"
                value={lat}
                inputMode="decimal"
                placeholder="15.0950"
                className={`${styles.input} ${styles.mono}`}
                onChange={(event) => {
                  setLat(event.target.value)
                  clearError("pin")
                }}
              />
            </div>
            <div className={styles.coord}>
              <Label htmlFor="f-lng" className={styles.coordLabel}>
                {t.submit.lng}
              </Label>
              <Input
                id="f-lng"
                value={lng}
                inputMode="decimal"
                placeholder="120.8280"
                className={`${styles.input} ${styles.mono}`}
                onChange={(event) => {
                  setLng(event.target.value)
                  clearError("pin")
                }}
              />
            </div>
          </div>
          {errors.pin ? <ErrorLine text={t.err.pin} shake={shake} /> : null}
        </div>

        <div className={styles.section}>
          <Label htmlFor="f-lgu" className={styles.label}>
            {t.submit.lgu}
          </Label>
          <Select
            items={items}
            value={lguSlug}
            onValueChange={(value) => {
              if (value) setLguSlug(value)
            }}
          >
            <SelectTrigger
              id="f-lgu"
              className={`${styles.input} ${styles.select}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              alignItemWithTrigger={false}
              className={styles.selectContent}
            >
              {sorted.map((lgu) => (
                <SelectItem
                  key={lgu.slug}
                  value={lgu.slug}
                  className={styles.selectItem}
                >
                  {lgu.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={styles.section}>
          <Label htmlFor="f-name" className={styles.label}>
            {t.submit.name}
          </Label>
          <Input
            id="f-name"
            value={locationName}
            placeholder={t.submit.namePh}
            aria-invalid={errors.name || undefined}
            className={`${styles.input} ${errors.name ? styles.inputError : ""}`}
            onChange={(event) => {
              setLocationName(event.target.value)
              clearError("name")
            }}
          />
          {errors.name ? <ErrorLine text={t.err.name} shake={shake} /> : null}
        </div>

        <div className={`${styles.section} ${styles.sectionLevel}`}>
          <span className={styles.label} id="f-level-label">
            {t.submit.level}
          </span>
          <LevelPicker
            labelledBy="f-level-label"
            value={level}
            onChange={(next) => {
              setLevel(next)
              clearError("level")
            }}
          />
          {errors.level ? <ErrorLine text={t.err.level} shake={shake} /> : null}
        </div>

        <div className={styles.section}>
          <Label htmlFor="f-desc" className={styles.label}>
            {t.submit.desc}
          </Label>
          <Textarea
            id="f-desc"
            rows={3}
            value={description}
            maxLength={DESCRIPTION_MAX}
            placeholder={t.submit.descPh}
            className={`${styles.input} ${styles.textarea}`}
            onChange={(event) =>
              setDescription(event.target.value.slice(0, DESCRIPTION_MAX))
            }
          />
          <span className={styles.counter}>
            {description.length} / {DESCRIPTION_MAX}
          </span>
        </div>

        <div className={styles.section}>
          <span className={styles.label}>{t.submit.photo}</span>
          <PhotoUpload photo={photo} onChange={setPhoto} />
        </div>

        <div className={`${styles.section} ${styles.sectionSend}`}>
          {/* Deliberately never disabled: pressing it is how the errors fire. */}
          <Button
            type="submit"
            className={styles.send}
            style={{
              background: complete ? "var(--fw-primary)" : "rgb(228, 228, 228)",
              color: complete ? "var(--fw-primary-fg)" : "rgb(150, 150, 150)",
            }}
          >
            {sending ? (
              <CircleNotchIcon
                size={18}
                weight="bold"
                className={`size-[18px] ${styles.spinner}`}
              />
            ) : null}
            {sending ? t.submit.sending : t.submit.send}
          </Button>
          {!online ? (
            <span className={styles.queueNote}>{t.submit.queue}</span>
          ) : null}
        </div>
      </div>
    </form>
  )
}
