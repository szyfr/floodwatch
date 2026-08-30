"use client"

import * as React from "react"
import {
  CheckCircleIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PencilSimpleIcon,
  SealCheckIcon,
  TrashIcon,
  UserIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react"

import { useLanguage } from "@/components/providers/language-provider"
import { useSocketEvent } from "@/components/providers/socket-provider"
import styles from "@/components/reports/manage-reports-view.module.css"
import { showToast } from "@/components/toast"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
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
import { FloodMap, type MapPoint } from "@/components/map/flood-map"
import { LevelPicker } from "@/components/submit/level-picker"
import { useClock } from "@/hooks/use-clock"
import { api } from "@/lib/client-api"
import {
  DESCRIPTION_MAX,
  LEVEL_META,
  MANAGE_PAGE_SIZE,
  PICKER_ZOOM,
  PROVINCE_CENTER,
  PROVINCE_ZOOM,
  REPORT_ORDERS,
  REPORT_STATUSES,
  WATER_LEVELS,
  formatAgo,
  formatCoords,
  formatCount,
  type ReportOrder,
  type ReportStatus,
  type WaterLevel,
} from "@/lib/domain"
import type {
  LguDto,
  ManageReportsDto,
  PublicReportDto,
  ReportDto,
} from "@/lib/dto"

/** Everything the console asks the server for, in one object. */
type Filters = {
  q: string
  lgu: string | null
  level: WaterLevel | null
  status: ReportStatus
  order: ReportOrder
}

/** Sentinel for the "all areas" / "all levels" rows - Select wants a string. */
const ANY = "*"

/** Keystrokes settle before the console asks the server again. */
const SEARCH_DELAY_MS = 250

function minutesAgo(now: number, iso: string): number {
  return Math.max(0, Math.round((now - Date.parse(iso)) / 60000))
}

/**
 * Does a report still belong on screen under the current filters?
 *
 * Used for the live socket patches only. The server is the authority for what
 * a page contains; this decides whether a report that changed under the
 * officer's eyes - verified by a colleague, moved to another area - should stay
 * in the list they are looking at, rather than sitting there contradicting the
 * filter that is switched on.
 */
function matchesFilters(report: PublicReportDto, filters: Filters): boolean {
  if (filters.lgu && report.lguSlug !== filters.lgu) return false
  if (filters.level && report.waterLevel !== filters.level) return false
  if (filters.status === "verified" && !report.verified) return false
  if (filters.status === "unverified" && report.verified) return false
  const needle = filters.q.trim().toLowerCase()
  if (needle) {
    const haystack =
      `${report.locationName} ${report.description ?? ""}`.toLowerCase()
    if (!haystack.includes(needle)) return false
  }
  return true
}

export function ManageReportsView({
  lgus,
  initialScope,
  initialReports,
  initialTotal,
  generatedAt,
}: {
  lgus: LguDto[]
  initialScope: string | null
  initialReports: ReportDto[]
  initialTotal: number
  generatedAt: string
}) {
  const { t, lang } = useLanguage()
  const now = useClock(Date.parse(generatedAt))

  const [filters, setFilters] = React.useState<Filters>({
    q: "",
    lgu: initialScope,
    level: null,
    status: "all",
    order: "newest",
  })
  // The rows and the count they are a window onto are one piece of state, not
  // two. Every local change moves both - a row that stops matching the filters
  // has to leave the total as well as the list, or the console ends up claiming
  // "Showing 0 of 1" over an empty list with a Load more button under it.
  const [page, setPage] = React.useState<ManageReportsDto>({
    reports: initialReports,
    total: initialTotal,
  })
  const { reports, total } = page
  const [loading, setLoading] = React.useState(false)
  const [appending, setAppending] = React.useState(false)
  const [editing, setEditing] = React.useState<ReportDto | null>(null)
  const [removing, setRemoving] = React.useState<ReportDto | null>(null)
  /** The row whose verify button is mid-flight, so it cannot be double-fired. */
  const [busyId, setBusyId] = React.useState<string | null>(null)

  // The copy deck is read inside async callbacks and effects that must not
  // re-run - refetching the page, losing the rows already loaded - just because
  // the reader switched language. Same trick useSocketEvent plays with handlers.
  const copy = React.useRef(t)
  React.useEffect(() => {
    copy.current = t
  })

  const failed = React.useCallback(() => {
    showToast(copy.current.toast.error, copy.current.toast.errorSub, "warn")
  }, [])

  /** Swaps a row for its new self, leaving the count alone. */
  const replace = React.useCallback((next: ReportDto) => {
    setPage((current) => ({
      ...current,
      reports: current.reports.map((report) =>
        report.id === next.id ? next : report
      ),
    }))
  }, [])

  /**
   * Takes a row off the list and out of the count - either because it was
   * removed, or because it no longer matches the filters it was found under.
   *
   * The decrement happens inside the updater, next to the check that the row
   * was there at all, so an echo of the officer's own removal arriving over the
   * socket cannot subtract the same row twice.
   */
  const drop = React.useCallback((id: string) => {
    setPage((current) => {
      const reports = current.reports.filter((report) => report.id !== id)
      if (reports.length === current.reports.length) return current
      return { reports, total: Math.max(0, current.total - 1) }
    })
  }, [])

  /** A saved row either stays under the current filters, or leaves them. */
  const settle = React.useCallback(
    (saved: ReportDto, against: Filters) => {
      if (matchesFilters(saved, against)) replace(saved)
      else drop(saved.id)
    },
    [replace, drop]
  )

  const asQuery = React.useCallback(
    (skip: number) => ({
      q: filters.q.trim() || null,
      lgu: filters.lgu,
      level: filters.level,
      status: filters.status,
      order: filters.order,
      skip,
      limit: MANAGE_PAGE_SIZE,
    }),
    [filters]
  )

  // Stamps every request so a slow answer to an old filter cannot overwrite a
  // fast answer to the current one.
  const requestSeq = React.useRef(0)
  // The server already rendered the first page for the filters this starts on,
  // so the effect's first run would only ask for it a second time.
  const primed = React.useRef(false)

  React.useEffect(() => {
    if (!primed.current) {
      primed.current = true
      return
    }
    const seq = ++requestSeq.current
    setLoading(true)
    const timer = setTimeout(() => {
      api
        .manageReports(asQuery(0))
        .then((fresh) => {
          if (seq !== requestSeq.current) return
          setPage(fresh)
          setLoading(false)
        })
        .catch(() => {
          if (seq !== requestSeq.current) return
          setLoading(false)
          failed()
        })
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [asQuery, failed])

  async function loadMore() {
    if (appending) return
    const seq = requestSeq.current
    setAppending(true)
    try {
      const next = await api.manageReports(asQuery(reports.length))
      // A filter change while this was in flight owns the list now.
      if (seq !== requestSeq.current) return
      setPage((current) => {
        // A removal can shorten the list under an in-flight page, which would
        // otherwise hand back a row the console is already showing.
        const seen = new Set(current.reports.map((report) => report.id))
        return {
          reports: [
            ...current.reports,
            ...next.reports.filter((report) => !seen.has(report.id)),
          ],
          total: next.total,
        }
      })
    } catch {
      failed()
    } finally {
      setAppending(false)
    }
  }

  // Two officers work the province at once, and a resident can edit their own
  // report while it is on screen, so the socket keeps this list honest rather
  // than leaving it to the next filter change.
  useSocketEvent("report:created", (incoming) => {
    // A new report belongs at the top only when the top is where the newest
    // report goes; oldest-first is a backlog being worked from the other end.
    if (filters.order !== "newest" || !matchesFilters(incoming, filters)) return
    setPage((current) =>
      current.reports.some((report) => report.id === incoming.id)
        ? current
        : {
            reports: [
              { ...incoming, myVote: null, isOwner: false },
              ...current.reports,
            ],
            total: current.total + 1,
          }
    )
  })

  useSocketEvent("report:updated", (incoming) => {
    const existing = reports.find((report) => report.id === incoming.id)
    if (!existing) return
    // An edit can move a report out from under the filter that is switched on -
    // verifying one while "Not verified" is selected, say.
    settle(
      { ...incoming, myVote: existing.myVote, isOwner: existing.isOwner },
      filters
    )
  })

  useSocketEvent("report:deleted", ({ id }) => drop(id))

  useSocketEvent("report:voted", ({ id, upvotes, downvotes }) => {
    setPage((current) => ({
      ...current,
      reports: current.reports.map((report) =>
        report.id === id ? { ...report, upvotes, downvotes } : report
      ),
    }))
  })

  async function setVerified(report: ReportDto, verified: boolean) {
    if (busyId) return
    setBusyId(report.id)
    try {
      const { report: saved } = await api.updateReport(report.id, { verified })
      // The row leaves the list when the verification filter no longer holds
      // it; otherwise it stays and picks up the badge.
      settle(saved, filters)
      showToast(
        verified
          ? copy.current.manage.okVerify
          : copy.current.manage.okUnverify,
        saved.locationName,
        "ok"
      )
    } catch {
      failed()
    } finally {
      setBusyId(null)
    }
  }

  async function remove(report: ReportDto) {
    await api.deleteReport(report.id)
    drop(report.id)
    setRemoving(null)
    showToast(copy.current.toast.deleted, copy.current.toast.deletedSub, "info")
  }

  const areaLabels: Record<string, string> = {
    [ANY]: t.manage.allAreas,
    ...Object.fromEntries(lgus.map((lgu) => [lgu.slug, lgu.name])),
  }
  const levelLabels: Record<string, string> = {
    [ANY]: t.dash.all,
    ...Object.fromEntries(WATER_LEVELS.map((code) => [code, t.levels[code]])),
  }
  const statusLabels: Record<ReportStatus, string> = {
    all: t.manage.statusAll,
    verified: t.manage.statusVerified,
    unverified: t.manage.statusUnverified,
  }
  const orderLabels: Record<ReportOrder, string> = {
    newest: t.manage.newest,
    oldest: t.manage.oldest,
  }

  const hasMore = reports.length < total

  return (
    <div className={styles.page}>
      <div className={styles.column}>
        <div className={styles.heading}>
          <span className={styles.title}>{t.manage.title}</span>
          <span className={styles.subtitle}>{t.manage.sub}</span>
        </div>

        <div className={styles.controls}>
          <div className={styles.searchWrap}>
            <MagnifyingGlassIcon size={16} className={styles.searchIcon} />
            <Input
              className={styles.search}
              value={filters.q}
              aria-label={t.manage.search}
              placeholder={t.manage.searchPh}
              onChange={(event) =>
                setFilters((f) => ({ ...f, q: event.target.value }))
              }
            />
          </div>

          <div className={styles.selects}>
            <Select
              items={areaLabels}
              value={filters.lgu ?? ANY}
              onValueChange={(value) => {
                if (value === null) return
                setFilters((f) => ({ ...f, lgu: value === ANY ? null : value }))
              }}
            >
              <SelectTrigger
                className={styles.select}
                aria-label={t.manage.area}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectItem value={ANY}>{t.manage.allAreas}</SelectItem>
                {lgus.map((lgu) => (
                  <SelectItem key={lgu.slug} value={lgu.slug}>
                    {lgu.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              items={levelLabels}
              value={filters.level ?? ANY}
              onValueChange={(value) => {
                if (value === null) return
                setFilters((f) => ({
                  ...f,
                  level: value === ANY ? null : (value as WaterLevel),
                }))
              }}
            >
              <SelectTrigger
                className={styles.select}
                aria-label={t.dash.legend}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectItem value={ANY}>{t.dash.all}</SelectItem>
                {WATER_LEVELS.map((code) => (
                  <SelectItem key={code} value={code}>
                    {t.levels[code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              items={statusLabels}
              value={filters.status}
              onValueChange={(value) => {
                if (value === null) return
                setFilters((f) => ({ ...f, status: value as ReportStatus }))
              }}
            >
              <SelectTrigger
                className={styles.select}
                aria-label={t.manage.status}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {REPORT_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {statusLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              items={orderLabels}
              value={filters.order}
              onValueChange={(value) => {
                if (value === null) return
                setFilters((f) => ({ ...f, order: value as ReportOrder }))
              }}
            >
              <SelectTrigger
                className={styles.select}
                aria-label={t.manage.order}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {REPORT_ORDERS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {orderLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <span className={styles.count} aria-live="polite">
            {loading
              ? t.manage.loading
              : t.manage.showing
                  .replace("{n}", formatCount(reports.length))
                  .replace("{total}", formatCount(total))}
          </span>
        </div>

        {reports.length === 0 && !loading ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <WarningIcon size={22} weight="regular" />
            </span>
            <span className={styles.emptyTitle}>{t.manage.empty}</span>
            <span className={styles.emptySub}>{t.manage.emptySub}</span>
          </div>
        ) : (
          <div className={`${styles.list} ${loading ? styles.listBusy : ""}`}>
            {reports.map((report) => {
              const meta = LEVEL_META[report.waterLevel]
              const description =
                (lang === "tl" && report.descriptionTl) || report.description

              return (
                <div key={report.id} className={styles.card}>
                  <span
                    className={styles.tile}
                    style={{ background: meta.color, color: meta.fg }}
                    aria-hidden="true"
                  >
                    {meta.letter}
                  </span>

                  <div className={styles.body}>
                    <div className={styles.nameRow}>
                      <span className={styles.name}>{report.locationName}</span>
                      <span className={styles.area}>{report.lguName}</span>
                      {report.verified ? (
                        <span className={styles.verified}>
                          <CheckCircleIcon size={13} weight="bold" />
                          {t.report.verified}
                        </span>
                      ) : (
                        <span className={styles.pending}>
                          {t.manage.unverified}
                        </span>
                      )}
                    </div>

                    {description ? (
                      <span className={styles.desc}>{description}</span>
                    ) : null}

                    <div className={styles.meta}>
                      <span className={styles.metaItem}>
                        <ClockIcon size={13} />
                        {formatAgo(minutesAgo(now, report.createdAt), lang)}
                      </span>
                      <span className={styles.metaItem}>
                        <UserIcon size={13} />
                        {`${t.manage.byLine} ${report.authorName ?? t.report.anon}`}
                      </span>
                      <span className={styles.metaItem}>
                        <MapPinIcon size={13} />
                        {formatCoords(report.lat, report.lng, 4)}
                      </span>
                      <span className={styles.metaItem}>
                        {`${report.upvotes - report.downvotes >= 0 ? "+" : ""}${
                          report.upvotes - report.downvotes
                        } ${t.manage.votes}`}
                      </span>
                    </div>
                  </div>

                  <div className={styles.actions}>
                    <Button
                      type="button"
                      variant="outline"
                      className={styles.action}
                      disabled={busyId === report.id}
                      onClick={() => setVerified(report, !report.verified)}
                    >
                      <SealCheckIcon
                        size={15}
                        weight={report.verified ? "fill" : "regular"}
                        className={styles.actionIcon}
                      />
                      {report.verified ? t.manage.unverify : t.manage.verify}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={styles.action}
                      onClick={() => setEditing(report)}
                    >
                      <PencilSimpleIcon
                        size={15}
                        className={styles.actionIcon}
                      />
                      {t.report.edit}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={`${styles.action} ${styles.danger}`}
                      onClick={() => setRemoving(report)}
                    >
                      <TrashIcon size={15} className={styles.actionIcon} />
                      {t.report.delete}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {hasMore ? (
          <Button
            type="button"
            variant="outline"
            className={styles.more}
            disabled={appending}
            onClick={loadMore}
          >
            {appending ? t.manage.loading : t.manage.more}
          </Button>
        ) : null}
      </div>

      {editing ? (
        <EditReportDialog
          key={editing.id}
          report={editing}
          lgus={lgus}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            settle(saved, filters)
            setEditing(null)
          }}
        />
      ) : null}

      {removing ? (
        <ConfirmRemoveDialog
          report={removing}
          onCancel={() => setRemoving(null)}
          onConfirm={() => remove(removing).catch(failed)}
        />
      ) : null}
    </div>
  )
}

/**
 * The office's correction form. Deliberately the same fields the reporter
 * filled in, plus the verification the office alone can grant: an officer
 * fixing a pin in the wrong barangay is making the report say what the reporter
 * meant, not filing a different one.
 */
function EditReportDialog({
  report,
  lgus,
  onClose,
  onSaved,
}: {
  report: ReportDto
  lgus: LguDto[]
  onClose: () => void
  onSaved: (report: ReportDto) => void
}) {
  const { t } = useLanguage()
  const fieldId = React.useId()

  const [locationName, setLocationName] = React.useState(report.locationName)
  const [lguSlug, setLguSlug] = React.useState(report.lguSlug)
  const [level, setLevel] = React.useState<WaterLevel>(report.waterLevel)
  const [description, setDescription] = React.useState(report.description ?? "")
  const [point, setPoint] = React.useState<MapPoint>({
    lat: report.lat,
    lng: report.lng,
  })
  const [saving, setSaving] = React.useState(false)

  const area = lgus.find((lgu) => lgu.slug === lguSlug)
  const focus = React.useMemo(
    () =>
      area
        ? { lat: area.lat, lng: area.lng, zoom: PICKER_ZOOM }
        : { ...PROVINCE_CENTER, zoom: PROVINCE_ZOOM },
    [area]
  )
  const areaLabels = Object.fromEntries(lgus.map((lgu) => [lgu.slug, lgu.name]))

  async function save() {
    if (locationName.trim().length < 2) {
      showToast(t.toast.error, t.err.name, "warn")
      return
    }
    if (saving) return
    setSaving(true)
    try {
      const { report: saved } = await api.updateReport(report.id, {
        lguSlug,
        locationName: locationName.trim(),
        description: description.trim() || null,
        waterLevel: level,
        lat: point.lat,
        lng: point.lng,
      })
      showToast(t.toast.sent, saved.locationName, "ok")
      onSaved(saved)
    } catch {
      showToast(t.toast.error, t.toast.errorSub, "warn")
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className={styles.dialog} showCloseButton={false}>
        <div className={styles.dialogHead}>
          <div className={styles.dialogHeadText}>
            <DialogTitle className={styles.dialogTitle}>
              {t.manage.edit}
            </DialogTitle>
            <span className={styles.dialogSub}>{t.manage.editSub}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            aria-label={t.common.close}
            className={styles.close}
            onClick={onClose}
          >
            <XIcon size={18} weight="bold" />
          </Button>
        </div>

        <div className={styles.field}>
          <Label className={styles.label} htmlFor={`${fieldId}-name`}>
            {t.submit.name}
          </Label>
          <Input
            id={`${fieldId}-name`}
            className={styles.input}
            value={locationName}
            placeholder={t.submit.namePh}
            onChange={(event) => setLocationName(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <Label className={styles.label} htmlFor={`${fieldId}-area`}>
            {t.submit.lgu}
          </Label>
          <Select
            items={areaLabels}
            value={lguSlug}
            onValueChange={(value) => {
              if (value !== null) setLguSlug(value)
            }}
          >
            <SelectTrigger id={`${fieldId}-area`} className={styles.select}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {lgus.map((lgu) => (
                <SelectItem key={lgu.slug} value={lgu.slug}>
                  {lgu.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={styles.field}>
          <span className={styles.label} id={`${fieldId}-level`}>
            {t.submit.level}
          </span>
          <LevelPicker
            value={level}
            onChange={setLevel}
            labelledBy={`${fieldId}-level`}
          />
        </div>

        <div className={styles.field}>
          <span className={styles.label}>{t.submit.where}</span>
          <div className={styles.map}>
            <FloodMap
              mode="picker"
              level="lgu"
              focus={focus}
              labels={false}
              pickedPoint={point}
              onPick={setPoint}
            />
          </div>
          <span className={styles.coords}>
            {formatCoords(point.lat, point.lng)}
          </span>
        </div>

        <div className={styles.field}>
          <Label className={styles.label} htmlFor={`${fieldId}-desc`}>
            {t.submit.desc}
          </Label>
          <Textarea
            id={`${fieldId}-desc`}
            className={styles.textarea}
            value={description}
            maxLength={DESCRIPTION_MAX}
            placeholder={t.submit.descPh}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className={styles.footer}>
          <Button
            type="button"
            variant="outline"
            className={styles.cancel}
            onClick={onClose}
          >
            {t.report.cancel}
          </Button>
          <Button
            type="button"
            className={styles.save}
            disabled={saving}
            onClick={save}
          >
            {t.manage.save}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Removing someone else's report is not the same act as removing your own, so
 * the console asks first - the resident's dialog deletes on the one press
 * because the report being removed is theirs.
 */
function ConfirmRemoveDialog({
  report,
  onCancel,
  onConfirm,
}: {
  report: ReportDto
  onCancel: () => void
  /** Resolves once the removal has been attempted, however it went. */
  onConfirm: () => Promise<void>
}) {
  const { t } = useLanguage()
  const [working, setWorking] = React.useState(false)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent className={styles.confirm} showCloseButton={false}>
        <DialogTitle className={styles.confirmTitle}>
          {t.manage.removeTitle}
        </DialogTitle>
        <span className={styles.confirmName}>
          {`${report.locationName} · ${report.lguName}`}
        </span>
        <span className={styles.confirmBody}>{t.manage.removeBody}</span>
        <div className={styles.footer}>
          <Button
            type="button"
            variant="outline"
            className={styles.cancel}
            onClick={onCancel}
          >
            {t.report.cancel}
          </Button>
          <Button
            type="button"
            className={styles.remove}
            disabled={working}
            onClick={() => {
              setWorking(true)
              // A failure leaves the dialog open so the press can be repeated;
              // a success unmounts it.
              onConfirm().finally(() => setWorking(false))
            }}
          >
            <TrashIcon size={15} className={styles.actionIcon} />
            {t.manage.remove}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
