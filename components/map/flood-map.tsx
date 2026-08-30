"use client"

import LeafletMap from "@/components/map/leaflet-map"
import type {
  GaugeDto,
  LguSummaryDto,
  PublicReportDto,
  ZoneDto,
} from "@/lib/dto"

export type MapPoint = { lat: number; lng: number }

export type FloodMapProps = {
  /** "picker" swaps the hint chip in and turns map clicks into `onPick`. */
  mode?: "dashboard" | "picker"
  /** "province" draws one bubble per LGU; "lgu" draws pins and safe zones. */
  level: "province" | "lgu"
  /** Where the map sits. Changing it flies there; identical values are ignored. */
  focus: { lat: number; lng: number; zoom: number }
  /**
   * A one-shot camera move, for a place the reporter searched. Read by
   * IDENTITY, not by value: pass a NEW object to move, and null the rest of the
   * time. That is the opposite of `focus` above, and it is the point. `focus`
   * is derived from the selected area, so two hits inside the same
   * municipality carry identical numbers and `focus` ignores them by contract.
   * It also anchors the LGU ring, which has no business following a search hit.
   *
   * Hold it in state. An object literal written inline at a call site is a new
   * object on every render and would fly on every keystroke.
   */
  flyTo?: (MapPoint & { zoom: number }) | null
  lgus?: LguSummaryDto[]
  pins?: PublicReportDto[]
  zones?: ZoneDto[]
  gauges?: GaugeDto[]
  /** Report id to ring in blue. Changing it never rebuilds the markers. */
  selectedId?: string | null
  /** Show the A/K/C/X letter inside each pin. */
  labels?: boolean
  loading?: boolean
  /** Picker mode: the pin's current position, including one typed by hand. */
  pickedPoint?: MapPoint | null
  onSelectReport?: (id: string) => void
  onSelectLgu?: (slug: string) => void
  onPick?: (point: MapPoint) => void
  className?: string
}

/**
 * The province / LGU flood map.
 *
 * Leaflet itself is only reached through `await import("leaflet")` inside an
 * effect, so this module is safe to evaluate on the server and needs no
 * `next/dynamic` boundary.
 *
 * It fills its parent absolutely, so the PARENT must be positioned and have a
 * real height - the design's dashboard cell uses
 * `position:relative;z-index:0;isolation:isolate` with a fixed or flexed
 * height. Inside a zero-height or statically positioned box Leaflet
 * initialises into a 0px container and paints an empty grey panel.
 */
export function FloodMap(props: FloodMapProps) {
  return <LeafletMap {...props} />
}

export default FloodMap
