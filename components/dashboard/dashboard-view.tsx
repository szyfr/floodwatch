"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  CaretRightIcon,
  MagnifyingGlassIcon,
  MapTrifoldIcon,
  PlusIcon,
} from "@phosphor-icons/react"

import styles from "@/components/dashboard/dashboard-view.module.css"
import { MapLegend } from "@/components/dashboard/map-legend"
import { ProvincePanel } from "@/components/dashboard/province-panel"
import { ReportCard } from "@/components/dashboard/report-card"
import { ReportDetailDialog } from "@/components/dashboard/report-detail-dialog"
import { ReportFilters } from "@/components/dashboard/report-filters"
import { FloodMap } from "@/components/map/flood-map"
import { useLanguage } from "@/components/providers/language-provider"
import { useSession } from "@/components/providers/session-provider"
import {
  useScope,
  useSocketEvent,
} from "@/components/providers/socket-provider"
import { AreaSheet } from "@/components/shell/area-sheet"
import { showToast } from "@/components/toast"
import { useClock } from "@/hooks/use-clock"
import { api } from "@/lib/client-api"
import {
  DEFAULT_RECENCY,
  LGU_ZOOM,
  PROVINCE_CENTER,
  PROVINCE_ZOOM,
  minutesSince,
  worstLevel,
  type Recency,
  type SortOption,
  type WaterLevel,
} from "@/lib/domain"
import type {
  DashboardDto,
  PublicReportDto,
  ReportDto,
  VoteValue,
  ZoneDto,
} from "@/lib/dto"
import { sortReports, summariseEvacuation } from "@/lib/serialize"

const SKELETONS = [1, 2, 3, 4]

type UrlPatch = Partial<{
  lgu: string | null
  level: WaterLevel | null
  recency: Recency
  sort: SortOption
  report: string | null
}>

export function DashboardView({
  data,
  scope,
  level,
  recency,
  sort,
  reportId,
  linkedReport,
}: {
  data: DashboardDto
  scope: string | null
  level: WaterLevel | null
  recency: Recency
  sort: SortOption
  reportId: string | null
  linkedReport: ReportDto | null
}) {
  const { t } = useLanguage()
  const session = useSession()
  const router = useRouter()

  const [snapshot, setSnapshot] = React.useState(data)
  const [reports, setReports] = React.useState(data.reports)
  const [gauges, setGauges] = React.useState(data.gauges)
  const [zones, setZones] = React.useState(data.zones)
  const [areas, setAreas] = React.useState(data.lgus)
  const [linked, setLinked] = React.useState(linkedReport)
  const [openId, setOpenId] = React.useState(reportId)
  const [areaOpen, setAreaOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  // The chips and selects have to move the moment they are pressed; the server
  // round-trip that follows only confirms them.
  const [draftFilters, setDraftFilters] = React.useState<{
    level: WaterLevel | null
    recency: Recency
    sort: SortOption
  }>({ level, recency, sort })
  // The server's own clock answers for the first render; the reader's takes
  // over as soon as the page is hydrated.
  const now = useClock(Date.parse(data.generatedAt))

  // Fresh server data replaces everything the socket merged into the old page.
  if (snapshot !== data) {
    setSnapshot(data)
    setReports(data.reports)
    setGauges(data.gauges)
    setZones(data.zones)
    setAreas(data.lgus)
    setLinked(linkedReport)
    setOpenId(reportId)
    setDraftFilters({ level, recency, sort })
  }

  useScope(scope)

  const inScope = React.useCallback(
    (report: PublicReportDto) => {
      if (scope && report.lguSlug !== scope) return false
      if (level && report.waterLevel !== level) return false
      if (recency !== "all" && minutesSince(report.createdAt) > Number(recency))
        return false
      return true
    },
    [scope, level, recency]
  )

  // Broadcasts carry no viewer-specific fields, so `myVote` and `isOwner` come
  // from the copy already on screen, or from the session for a first sighting.
  const decorate = React.useCallback(
    (incoming: PublicReportDto, previous?: ReportDto): ReportDto => ({
      ...incoming,
      myVote: previous?.myVote ?? null,
      isOwner:
        previous?.isOwner ?? (!!session && incoming.authorId === session.id),
    }),
    [session]
  )

  const patchReport = React.useCallback(
    (id: string, update: (report: ReportDto) => ReportDto) => {
      setReports((current) =>
        current.map((report) => (report.id === id ? update(report) : report))
      )
      setLinked((current) =>
        current && current.id === id ? update(current) : current
      )
    },
    []
  )

  /**
   * The province rollup is derived server-side, so a live report has to be
   * folded into it here or the default screen's bubbles and LGU rows go stale
   * until the next navigation.
   */
  const bumpArea = React.useCallback(
    (lguSlug: string, waterLevel: WaterLevel, createdAt: string) => {
      setAreas((current) =>
        current.map((area) =>
          area.slug === lguSlug
            ? {
                ...area,
                reportCount: area.reportCount + 1,
                worstLevel: worstLevel(area.worstLevel, waterLevel),
                latestMinutesAgo: Math.min(
                  area.latestMinutesAgo ?? Number.POSITIVE_INFINITY,
                  minutesSince(createdAt)
                ),
              }
            : area
        )
      )
    },
    []
  )

  /** A removal cannot be derived incrementally - ask the server for the truth. */
  const refreshAreas = React.useCallback(() => {
    void api
      .lgus()
      .then((data) => setAreas(data.lgus))
      .catch(() => {
        /* the rollup catches up on the next navigation */
      })
  }, [])

  useSocketEvent("report:created", (incoming) => {
    bumpArea(incoming.lguSlug, incoming.waterLevel, incoming.createdAt)
    if (!inScope(incoming)) return
    setReports((current) =>
      current.some((report) => report.id === incoming.id)
        ? current
        : sortReports([decorate(incoming), ...current], sort)
    )
  })

  useSocketEvent("report:updated", (incoming) => {
    setReports((current) => {
      const previous = current.find((report) => report.id === incoming.id)
      if (!inScope(incoming)) {
        return previous
          ? current.filter((report) => report.id !== incoming.id)
          : current
      }
      const merged = decorate(incoming, previous)
      return sortReports(
        previous
          ? current.map((report) =>
              report.id === incoming.id ? merged : report
            )
          : [merged, ...current],
        sort
      )
    })
    setLinked((current) =>
      current && current.id === incoming.id
        ? decorate(incoming, current)
        : current
    )
    // A level change or a move between areas both shift the rollup.
    refreshAreas()
  })

  useSocketEvent("report:deleted", ({ id }) => {
    setReports((current) => current.filter((report) => report.id !== id))
    setOpenId((current) => (current === id ? null : current))
    refreshAreas()
  })

  // Counts arrive absolute, so this stays consistent with the optimistic
  // update the viewer's own vote already applied. The order is left alone:
  // resorting under the reader's finger loses the card they were reading.
  useSocketEvent("report:voted", ({ id, upvotes, downvotes }) => {
    patchReport(id, (report) => ({ ...report, upvotes, downvotes }))
  })

  const upsertZone = React.useCallback(
    (zone: ZoneDto) => {
      if (scope && zone.lguSlug !== scope) return
      setZones((current) =>
        (current.some((row) => row.id === zone.id)
          ? current.map((row) => (row.id === zone.id ? zone : row))
          : [...current, zone]
        ).sort((a, b) => a.name.localeCompare(b.name))
      )
    },
    [scope]
  )

  useSocketEvent("zone:created", upsertZone)
  useSocketEvent("zone:updated", upsertZone)
  useSocketEvent("zone:deleted", ({ id }) => {
    setZones((current) => current.filter((zone) => zone.id !== id))
  })

  useSocketEvent("gauge:updated", (gauge) => {
    if (scope && gauge.lguSlug !== scope) return
    setGauges((current) =>
      (current.some((row) => row.id === gauge.id)
        ? current.map((row) => (row.id === gauge.id ? gauge : row))
        : [...current, gauge]
      ).sort((a, b) => a.name.localeCompare(b.name))
    )
  })

  const href = React.useCallback(
    (patch: UrlPatch) => {
      const next = {
        lgu: scope,
        level,
        recency,
        sort,
        report: openId,
        ...patch,
      }
      const params = new URLSearchParams()
      if (next.lgu) params.set("lgu", next.lgu)
      if (next.level) params.set("level", next.level)
      if (next.recency !== DEFAULT_RECENCY) params.set("recency", next.recency)
      if (next.sort !== "recent") params.set("sort", next.sort)
      if (next.report) params.set("report", next.report)
      return `/dashboard${params.size ? `?${params}` : ""}`
    },
    [scope, level, recency, sort, openId]
  )

  // Filter and scope changes go through a transition so the panel can show the
  // design's skeletons for exactly as long as the server takes.
  const navigate = React.useCallback(
    (patch: UrlPatch) => {
      startTransition(() => {
        router.push(href(patch))
      })
    },
    [href, router]
  )

  const selectLgu = React.useCallback(
    (slug: string | null) => {
      setOpenId(null)
      navigate({ lgu: slug, report: null })
    },
    [navigate]
  )

  // The dialog opens from local state at once; the URL catches up so the view
  // stays linkable and the back button closes it.
  const openReport = React.useCallback(
    (id: string) => {
      setOpenId(id)
      router.push(href({ report: id }))
    },
    [href, router]
  )

  // `replace`, not `push`: opening a report already added a history entry, and
  // closing it should not cost a second Back press to undo.
  const closeReport = React.useCallback(() => {
    setOpenId(null)
    router.replace(href({ report: null }))
  }, [href, router])

  // A double-tap fires two overlapping requests; only the newest answer may
  // land, or an older response would undo the newer vote.
  const voteSeq = React.useRef(new Map<string, number>())

  const vote = React.useCallback(
    async (report: ReportDto, direction: VoteValue) => {
      if (!session) {
        router.push(`/signin?next=${encodeURIComponent(href({}))}`)
        return
      }
      const nextVote = report.myVote === direction ? null : direction
      const upDelta =
        (nextVote === "UP" ? 1 : 0) - (report.myVote === "UP" ? 1 : 0)
      const downDelta =
        (nextVote === "DOWN" ? 1 : 0) - (report.myVote === "DOWN" ? 1 : 0)

      patchReport(report.id, (current) => ({
        ...current,
        myVote: nextVote,
        upvotes: current.upvotes + upDelta,
        downvotes: current.downvotes + downDelta,
      }))

      const ticket = (voteSeq.current.get(report.id) ?? 0) + 1
      voteSeq.current.set(report.id, ticket)

      try {
        const { report: saved } = await api.vote(report.id, nextVote)
        if (voteSeq.current.get(report.id) !== ticket) return
        patchReport(report.id, () => saved)
        showToast(t.toast.voted, t.toast.votedSub, "info")
      } catch {
        if (voteSeq.current.get(report.id) !== ticket) return
        // Undo exactly what this attempt applied, so a broadcast that landed
        // in the meantime survives.
        patchReport(report.id, (current) => ({
          ...current,
          myVote: report.myVote,
          upvotes: current.upvotes - upDelta,
          downvotes: current.downvotes - downDelta,
        }))
        showToast(t.toast.error, t.toast.errorSub, "warn")
      }
    },
    [session, router, href, patchReport, t]
  )

  const removeReport = React.useCallback(
    (id: string) => {
      setReports((current) => current.filter((report) => report.id !== id))
      setOpenId(null)
      router.push(href({ report: null }))
    },
    [href, router]
  )

  const inProvince = !data.lgu
  const focus = data.lgu
    ? { lat: data.lgu.lat, lng: data.lgu.lng, zoom: LGU_ZOOM }
    : {
        lat: PROVINCE_CENTER.lat,
        lng: PROVINCE_CENTER.lng,
        zoom: PROVINCE_ZOOM,
      }
  const evacuation = React.useMemo(() => summariseEvacuation(zones), [zones])
  const detail = openId
    ? (reports.find((report) => report.id === openId) ??
      (linked?.id === openId ? linked : null))
    : null

  return (
    <div className={styles.dashboard}>
      <div className={styles.mapPane}>
        <FloodMap
          level={inProvince ? "province" : "lgu"}
          focus={focus}
          lgus={areas}
          pins={inProvince ? [] : reports}
          zones={inProvince ? [] : zones}
          gauges={gauges}
          selectedId={openId}
          loading={pending}
          onSelectLgu={selectLgu}
          onSelectReport={openReport}
        />
        <MapLegend scope={inProvince ? "province" : "lgu"} />
      </div>

      <div className={styles.panel}>
        <div className={styles.crumb}>
          <button
            type="button"
            className={`${styles.crumbProvince} ${inProvince ? styles.crumbCurrent : ""}`}
            onClick={() => selectLgu(null)}
          >
            {t.scope.province}
          </button>
          {data.lgu ? (
            <>
              <CaretRightIcon
                size={14}
                weight="bold"
                className={styles.crumbCaret}
              />
              <span className={styles.crumbLgu}>{data.lgu.name}</span>
            </>
          ) : null}
          <button
            type="button"
            className={styles.changeArea}
            onClick={() => setAreaOpen(true)}
          >
            <MagnifyingGlassIcon size={14} />
            {t.scope.change}
          </button>
        </div>

        {inProvince ? (
          <ProvincePanel
            gauges={gauges}
            lgus={areas}
            evacuation={evacuation}
            loading={pending}
            onSelectLgu={selectLgu}
          />
        ) : (
          <>
            <ReportFilters
              count={reports.length}
              loading={pending}
              level={draftFilters.level}
              recency={draftFilters.recency}
              sort={draftFilters.sort}
              onLevelChange={(next) => {
                setDraftFilters((current) => ({ ...current, level: next }))
                navigate({ level: next })
              }}
              onRecencyChange={(next) => {
                setDraftFilters((current) => ({ ...current, recency: next }))
                navigate({ recency: next })
              }}
              onSortChange={(next) => {
                setDraftFilters((current) => ({ ...current, sort: next }))
                navigate({ sort: next })
              }}
            />

            <div className={styles.list}>
              {pending ? (
                SKELETONS.map((key) => (
                  <div key={key} className={styles.skeletonCard}>
                    <div className={styles.skeletonHead}>
                      <span className={styles.skeletonPill} />
                      <span className={styles.skeletonAgo} />
                    </div>
                    <span className={styles.skeletonName} />
                    <span className={styles.skeletonDesc} />
                    <div className={styles.skeletonActions}>
                      <span className={styles.skeletonButton} />
                      <span className={styles.skeletonButton} />
                    </div>
                  </div>
                ))
              ) : reports.length === 0 ? (
                <div className={styles.empty}>
                  <span className={styles.emptyIcon}>
                    <MapTrifoldIcon size={22} />
                  </span>
                  <span className={styles.emptyTitle}>{t.dash.empty}</span>
                  <span className={styles.emptySub}>{t.dash.emptySub}</span>
                  <Link
                    href={scope ? `/submit?lgu=${scope}` : "/submit"}
                    className={styles.emptyCta}
                  >
                    {t.dash.beFirst}
                  </Link>
                </div>
              ) : (
                reports.map((report) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    now={now}
                    onOpen={openReport}
                    onVote={vote}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>

      <div className={styles.cta}>
        <Link
          href={scope ? `/submit?lgu=${scope}` : "/submit"}
          className={styles.ctaButton}
        >
          <PlusIcon size={19} weight="bold" />
          {t.nav.submit}
        </Link>
      </div>

      <AreaSheet
        open={areaOpen}
        onOpenChange={setAreaOpen}
        lgus={areas}
        selectedSlug={scope}
        onSelect={selectLgu}
      />

      <ReportDetailDialog
        report={detail}
        now={now}
        onClose={closeReport}
        onVote={vote}
        onDeleted={removeReport}
      />
    </div>
  )
}
