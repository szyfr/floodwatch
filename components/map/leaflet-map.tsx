"use client"

import "leaflet/dist/leaflet.css"
import "./pampanga-map.css"
import type * as LeafletNS from "leaflet"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react"

import { useT } from "@/components/providers/language-provider"
import type { FloodMapProps, MapPoint } from "@/components/map/flood-map"
import {
  bubbleDiameter,
  bubbleHtml,
  FOCUS_RING_RADIUS,
  gaugeHtml,
  MAP_BLUE,
  PICK_PIN_HTML,
  pinHtml,
  RIO_CHICO,
  RIVER,
  TILE_ATTRIBUTION,
  TILE_MAX_ZOOM,
  TILE_URL,
  tooltipText,
  zoneHtml,
} from "@/components/map/map-constants"
import {
  PROVINCE_CENTER,
  PROVINCE_ZOOM,
  type AlarmLevel,
  type WaterLevel,
  type ZoneType,
} from "@/lib/domain"

type Bubble = {
  slug: string
  name: string
  lat: number
  lng: number
  count: number
  worst: WaterLevel | null
}
type Pin = {
  id: string
  level: WaterLevel
  lat: number
  lng: number
  name: string
  isNew: boolean
}
type ZoneMarker = {
  id: string
  name: string
  type: ZoneType
  lat: number
  lng: number
}
type GaugeMarker = {
  name: string
  lat: number
  lng: number
  alarm: AlarmLevel
  reading: string
}

const HOST: CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
}
const CANVAS: CSSProperties = { position: "absolute", inset: 0 }
const CHROME: CSSProperties = {
  position: "absolute",
  right: 10,
  bottom: 10,
  zIndex: 500,
  display: "flex",
  flexDirection: "column",
  gap: 6,
}
const HINT: CSSProperties = {
  position: "absolute",
  left: 10,
  top: 10,
  zIndex: 500,
  background: "rgba(255,255,255,.94)",
  border: "1px solid rgb(229,229,229)",
  borderRadius: 8,
  padding: "6px 10px",
  boxShadow: "0 1px 2px rgba(0,0,0,.08)",
  font: "500 12px/16px var(--fw-font-sans)",
  color: "rgb(64,64,64)",
}

export default function LeafletMap({
  mode = "dashboard",
  level,
  focus,
  lgus = [],
  pins = [],
  zones = [],
  gauges = [],
  selectedId = null,
  labels = true,
  loading = false,
  pickedPoint,
  flyTo = null,
  onSelectReport,
  onSelectLgu,
  onPick,
  className,
}: FloodMapProps) {
  const t = useT()
  const hostRef = useRef<HTMLDivElement>(null)
  const LRef = useRef<typeof LeafletNS | null>(null)
  const mapRef = useRef<LeafletNS.Map | null>(null)
  const markersRef = useRef<LeafletNS.LayerGroup | null>(null)
  const ringRef = useRef<LeafletNS.LayerGroup | null>(null)
  const pickMarkerRef = useRef<LeafletNS.Marker | null>(null)
  const pinElsRef = useRef<Record<string, HTMLElement | null>>({})
  const drawnSigRef = useRef<string | null>(null)
  const focusKeyRef = useRef<string | null>(null)

  const [ready, setReady] = useState(false)
  // Uncontrolled fallback so the picker still drops a pin when the parent does
  // not feed `pickedPoint` back.
  const [ownPick, setOwnPick] = useState<MapPoint | null>(null)

  const controlled = pickedPoint !== undefined
  const pick = controlled ? pickedPoint : ownPick
  const pickLat = pick ? pick.lat : null
  const pickLng = pick ? pick.lng : null

  const bubbles: Bubble[] = lgus.map((lgu) => ({
    slug: lgu.slug,
    name: lgu.name,
    lat: lgu.lat,
    lng: lgu.lng,
    count: lgu.reportCount,
    worst: lgu.worstLevel,
  }))
  const pinMarkers: Pin[] = pins.map((report) => ({
    id: report.id,
    level: report.waterLevel,
    lat: report.lat,
    lng: report.lng,
    name: report.locationName,
    isNew: report.isNew,
  }))
  const zoneMarkers: ZoneMarker[] = zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    type: zone.type,
    lat: zone.lat,
    lng: zone.lng,
  }))
  const gaugeMarkers: GaugeMarker[] = gauges.map((gauge) => ({
    name: gauge.name,
    lat: gauge.lat,
    lng: gauge.lng,
    alarm: gauge.alarmLevel,
    reading: `${gauge.readingMetres.toFixed(1)} m`,
  }))

  /**
   * Markers are rebuilt only when this changes. `selectedId` is deliberately
   * absent: rebuilding replays every pin's 220ms pop-in, which reads as a
   * full-map flicker each time the reader opens a different report.
   */
  const sig = JSON.stringify([
    level,
    bubbles,
    pinMarkers,
    zoneMarkers,
    gaugeMarkers,
    labels,
  ])

  // Mirror of everything the imperative Leaflet code needs, so no effect below
  // has to list props it does not want to react to.
  const snapshot = {
    sig,
    level,
    focus,
    bubbles,
    pins: pinMarkers,
    zones: zoneMarkers,
    gauges: gaugeMarkers,
    labels,
    selectedId,
    controlled,
    onSelectReport,
    onSelectLgu,
    onPick,
  }
  const latest = useRef(snapshot)
  useEffect(() => {
    latest.current = snapshot
  })

  const syncSelection = useCallback(() => {
    const selected = latest.current.selectedId
    for (const [id, el] of Object.entries(pinElsRef.current)) {
      el?.querySelector(".pm-pin")?.classList.toggle("pm-sel", id === selected)
    }
  }, [])

  const draw = useCallback(() => {
    const L = LRef.current
    const layer = markersRef.current
    if (!L || !layer) return

    const state = latest.current
    if (state.sig === drawnSigRef.current) {
      syncSelection()
      return
    }
    drawnSigRef.current = state.sig
    pinElsRef.current = {}
    layer.clearLayers()

    for (const gauge of state.gauges) {
      L.marker([gauge.lat, gauge.lng], {
        icon: L.divIcon({
          className: "",
          iconSize: [24, 24],
          iconAnchor: [12, 12],
          html: gaugeHtml(gauge.alarm),
        }),
        zIndexOffset: 150,
      })
        .addTo(layer)
        .bindTooltip(
          `${tooltipText(gauge.name)} · ${tooltipText(gauge.reading)}`,
          {
            direction: "top",
            offset: [0, -12],
          }
        )
    }

    if (state.level === "province") {
      for (const bubble of state.bubbles) {
        const size = bubbleDiameter(bubble.count)
        L.marker([bubble.lat, bubble.lng], {
          icon: L.divIcon({
            className: "",
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
            html: bubbleHtml(bubble),
          }),
          zIndexOffset: 200 + bubble.count,
          title: bubble.name,
        })
          .addTo(layer)
          .on("click", () => latest.current.onSelectLgu?.(bubble.slug))
      }
      return
    }

    for (const zone of state.zones) {
      L.marker([zone.lat, zone.lng], {
        icon: L.divIcon({
          className: "",
          iconSize: [26, 26],
          iconAnchor: [13, 13],
          html: zoneHtml(zone.type),
        }),
        zIndexOffset: 100,
      })
        .addTo(layer)
        .bindTooltip(tooltipText(zone.name), {
          direction: "top",
          offset: [0, -12],
        })
    }

    for (const pin of state.pins) {
      const marker = L.marker([pin.lat, pin.lng], {
        icon: L.divIcon({
          className: "",
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          html: pinHtml(pin, state.labels, state.selectedId === pin.id),
        }),
        zIndexOffset: 300,
        keyboard: true,
        title: pin.name,
      }).addTo(layer)
      pinElsRef.current[pin.id] = marker.getElement() ?? null
      marker.on("click", () => latest.current.onSelectReport?.(pin.id))
    }
  }, [syncSelection])

  // Creates the map exactly once. Data lands through the effects below -
  // rebuilding here would refetch every tile and lose the reader's pan/zoom.
  useEffect(() => {
    let cancelled = false
    let observer: ResizeObserver | null = null
    let settle: ReturnType<typeof setTimeout> | undefined

    const load = import("leaflet").then((mod) => {
      const L = (mod.default ?? mod) as typeof LeafletNS
      const host = hostRef.current
      // StrictMode's first cleanup can land before this resolves.
      if (cancelled || !host) return

      const start = latest.current.focus
      const map = L.map(host, {
        center: [start.lat, start.lng],
        zoom: start.zoom,
        zoomControl: false,
        attributionControl: true,
      })
      focusKeyRef.current = `${start.lat},${start.lng},${start.zoom}`

      // No `detectRetina` here on purpose - TILE_URL's own `{r}` covers
      // high-DPI screens, and the option would quadruple the tile count.
      L.tileLayer(TILE_URL, {
        maxZoom: TILE_MAX_ZOOM,
        attribution: TILE_ATTRIBUTION,
      }).addTo(map)
      map.attributionControl.setPrefix("")
      map.attributionControl.getContainer()?.classList.add("pm-attr")

      const rivers = L.layerGroup().addTo(map)
      L.polyline(RIVER, {
        color: MAP_BLUE,
        weight: 4,
        opacity: 0.32,
        lineJoin: "round",
        interactive: false,
      }).addTo(rivers)
      L.polyline(RIO_CHICO, {
        color: MAP_BLUE,
        weight: 3,
        opacity: 0.26,
        lineJoin: "round",
        interactive: false,
      }).addTo(rivers)

      LRef.current = L
      mapRef.current = map
      ringRef.current = L.layerGroup().addTo(map)
      markersRef.current = L.layerGroup().addTo(map)

      if (mode === "picker") {
        map.on("click", (event) => {
          const point = { lat: event.latlng.lat, lng: event.latlng.lng }
          if (!latest.current.controlled) setOwnPick(point)
          latest.current.onPick?.(point)
        })
      }

      observer = new ResizeObserver(() =>
        map.invalidateSize({ animate: false })
      )
      observer.observe(host)
      // The observer misses containers whose final size only settles after the
      // first paint, which is the common case inside a flex dashboard.
      settle = setTimeout(() => map.invalidateSize({ animate: false }), 60)

      setReady(true)
    })
    load.catch((error: unknown) => {
      // A failed map is a degraded page, not a blank one - say so out loud.
      console.error("[flood-map] could not initialise Leaflet", error)
    })

    return () => {
      cancelled = true
      clearTimeout(settle)
      observer?.disconnect()
      // remove() clears container._leaflet_id, which is what lets StrictMode's
      // second pass call L.map() on the same node.
      mapRef.current?.remove()
      mapRef.current = null
      LRef.current = null
      markersRef.current = null
      ringRef.current = null
      pickMarkerRef.current = null
      pinElsRef.current = {}
      drawnSigRef.current = null
      focusKeyRef.current = null
      setReady(false)
    }
  }, [mode])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const key = `${focus.lat},${focus.lng},${focus.zoom}`
    if (key === focusKeyRef.current) return
    focusKeyRef.current = key
    map.flyTo([focus.lat, focus.lng], focus.zoom, { duration: 0.8 })
  }, [focus.lat, focus.lng, focus.zoom, ready])

  /**
   * A searched place, as a one-shot move. Deliberately its own effect rather
   * than folded into `focus` above: `focus` also positions the LGU ring below,
   * so repurposing it would drag a 4.2 km "this is your area" circle onto a
   * street corner. Keyed on object identity, so selecting the same result twice
   * flies twice, which the value compare above cannot do.
   *
   * It must stay AFTER the focus effect. A search can change the area select
   * and the target in one commit; both effects then run, in source order, and
   * this one lands last and wins. Nothing has to cancel the first flight -
   * L.Map.flyTo calls _stop() before it starts.
   *
   * `focusKeyRef` is deliberately untouched: this is a camera move, not a new
   * `focus`, and clearing the latch would invite a stray fly-back later.
   * `ready` is in the deps so a selection made while Leaflet is still being
   * imported is honoured once the map exists instead of being dropped.
   *
   * It is also kept out of `sig`: a redraw clears every layer and replays each
   * marker's pop-in, which would read as a full-map flicker on every search.
   */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !flyTo) return
    map.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom, { duration: 0.8 })
  }, [flyTo, ready])

  useEffect(() => {
    draw()
  }, [draw, sig, ready])

  useEffect(() => {
    syncSelection()
  }, [syncSelection, selectedId, sig, ready])

  // The ring follows `focus`, which is not part of the redraw signature, so it
  // lives in its own layer. Circles paint in the overlay pane and markers in
  // the marker pane, so splitting them changes nothing visually.
  useEffect(() => {
    const L = LRef.current
    const ring = ringRef.current
    if (!L || !ring) return
    ring.clearLayers()
    if (level === "province") return
    L.circle([focus.lat, focus.lng], {
      radius: FOCUS_RING_RADIUS,
      color: MAP_BLUE,
      weight: 1.5,
      dashArray: "5 5",
      fillColor: MAP_BLUE,
      fillOpacity: 0.04,
      interactive: false,
    }).addTo(ring)
  }, [level, focus.lat, focus.lng, ready])

  useEffect(() => {
    const L = LRef.current
    const map = mapRef.current
    if (!L || !map) return
    if (pickMarkerRef.current) {
      map.removeLayer(pickMarkerRef.current)
      pickMarkerRef.current = null
    }
    if (pickLat === null || pickLng === null) return
    pickMarkerRef.current = L.marker([pickLat, pickLng], {
      icon: L.divIcon({
        className: "",
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        html: PICK_PIN_HTML,
      }),
    }).addTo(map)
  }, [pickLat, pickLng, ready])

  return (
    <div style={HOST} className={className}>
      <div ref={hostRef} style={CANVAS} />

      <div style={CHROME}>
        <button
          type="button"
          className="pm-btn"
          title={t.map.zoomIn}
          aria-label={t.map.zoomIn}
          onClick={() => mapRef.current?.zoomIn()}
        >
          +
        </button>
        <button
          type="button"
          className="pm-btn"
          title={t.map.zoomOut}
          aria-label={t.map.zoomOut}
          onClick={() => mapRef.current?.zoomOut()}
        >
          {"−"}
        </button>
        <button
          type="button"
          className="pm-btn"
          title={t.map.fitProvince}
          aria-label={t.map.fitProvince}
          onClick={() =>
            mapRef.current?.flyTo(
              [PROVINCE_CENTER.lat, PROVINCE_CENTER.lng],
              PROVINCE_ZOOM,
              {
                duration: 0.8,
              }
            )
          }
        >
          <svg
            viewBox="0 0 24 24"
            width="17"
            height="17"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 6.2l5-2 6 2 5-2v13.6l-5 2-6-2-5 2z" />
            <path d="M9 4.2v13.6M15 6.2v13.6" />
          </svg>
        </button>
      </div>

      {mode === "picker" && (
        <div style={HINT}>{pick ? t.map.pickPlaced : t.map.pickHint}</div>
      )}

      {(loading || !ready) && <div className="pm-skel" />}
    </div>
  )
}
