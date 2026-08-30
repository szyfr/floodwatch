"use client"

import * as React from "react"
import { Combobox } from "@base-ui/react/combobox"
import {
  CircleNotchIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  XIcon,
} from "@phosphor-icons/react"

import { useLanguage } from "@/components/providers/language-provider"
import styles from "@/components/submit/place-search.module.css"
import { useOnline } from "@/hooks/use-online"
import { api } from "@/lib/client-api"
import type { LguDto, PlaceDto } from "@/lib/dto"

/**
 * The picker's place search: type a barangay, a street or a landmark and get a
 * row that drops the pin there.
 *
 * It is a SIBLING of the map rather than an overlay inside it. The picker's box
 * is `overflow: hidden` with `isolation: isolate` and LeafletMap's own host is
 * `overflow: hidden` too, so a results popup drawn inside would be clipped and
 * would need its own stacking fight with the zoom chrome at z-index 500.
 * Worse, a Leaflet container swallows nothing: a tap on a suggestion sitting
 * over the canvas falls through to `map.on("click")` and drops a pin under the
 * row the reporter was aiming at, unless every such element is wrapped in
 * `L.DomEvent.disableClickPropagation`. Outside the box, none of that exists,
 * and the popup is portalled so it still overlays the map.
 *
 * Base UI's Combobox is imported directly, with no components/ui wrapper, the
 * way critical-alert-gate.tsx imports AlertDialog. A wrapper would hand the
 * primitive the shared Tailwind skin and then have this module immediately
 * override it against the form's 44px / 15px metrics, which is the fight
 * submit-form.module.css already picks with ui/input.tsx's `h-8`. If a second
 * consumer with different chrome appears, extracting ui/combobox.tsx is short.
 *
 * A failed search is never a form error. It has no ErrorSlot, it cannot block
 * submit, and every failure line ends by pointing at the map, which is always
 * there and always works.
 */

const MIN_CHARS = 3

/**
 * The two consoles debounce at 250ms against our own database. This one leaves
 * the building, and Photon's terms are "be fair" rather than a number.
 */
const SEARCH_DELAY_MS = 300

/** A stable empty list, so "no results yet" is not a new array every render. */
const NO_PLACES: PlaceDto[] = []

/**
 * Area names reduced to something a typed query can hit.
 *
 * The remote half gets this folding on the server; the local half is the one
 * that has to work with no signal, so it cannot skip it. "Sto Tomas" and "sta
 * rita" are how these names are written on a sign and typed on a phone, and a
 * plain lowercase `includes` matches neither against "Santo Tomas".
 */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bsto\b/g, "santo")
    .replace(/\bsta\b/g, "santa")
    .trim()
}

type Group = { value: string; items: PlaceDto[] }

/**
 * The last answer, tagged with the query it answers.
 *
 * Tagging is what makes every stale case fall out for free. A slow reply to an
 * old keystroke, a query that dropped back under the floor, a language switch:
 * in each the tag stops matching and the derived values below go quiet, with no
 * sequence number to compare and nothing to clear. It is also why the effect
 * never has to setState on its bail path.
 */
type Search =
  | { key: string; state: "loading" }
  | { key: string; state: "failed" }
  | { key: string; state: "done"; places: PlaceDto[] }

export function PlaceSearch({
  lgus,
  remote,
  onSelect,
}: {
  /** Already in the picker's props. Filtered locally, so it works offline. */
  lgus: LguDto[]
  /** False when the server has no geocoder: local areas only, no requests. */
  remote: boolean
  onSelect: (place: PlaceDto) => void
}) {
  const { t, lang } = useLanguage()
  const online = useOnline()

  const [query, setQuery] = React.useState("")
  const [search, setSearch] = React.useState<Search | null>(null)

  /**
   * The label a selection just wrote into the input.
   *
   * Base UI fills the input with the chosen label whenever the selection is
   * single and the input sits outside the popup, which is this control exactly.
   * On screen that is right - the field should show what was picked - but the
   * label then arrives back here as a brand new query and would spend a request
   * asking the geocoder to find the thing the reporter has already found. This
   * skips that one round trip, and clears itself so typing it again searches.
   */
  const settledRef = React.useRef<string | null>(null)

  const needle = query.trim()
  const key = `${lang}:${needle}`

  React.useEffect(() => {
    if (settledRef.current === needle) {
      settledRef.current = null
      return
    }

    // Below the floor, offline, or switched off. Nothing to clear: the tag on
    // whatever `search` holds no longer matches, so it is already ignored.
    if (!remote || !online || needle.length < MIN_CHARS) return

    // One controller per effect run, aborted by this run's own cleanup. That
    // covers the keystroke that supersedes this one and the unmount alike,
    // which is why no ref has to hold the previous request.
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setSearch({ key, state: "loading" })
      api
        .places(needle, lang, { signal: controller.signal })
        .then((data) => {
          // A degraded answer means the province-wide ceiling was in force and
          // the geocoder was never asked, so an empty one is not an absence.
          // Anything it did have cached is still worth showing.
          if (data.degraded && data.places.length === 0) {
            setSearch({ key, state: "failed" })
            return
          }
          setSearch({ key, state: "done", places: data.places })
        })
        .catch(() => {
          if (controller.signal.aborted) return
          // 502, 429 and a dead connection all read the same to a reporter:
          // search is not answering, so use the map.
          setSearch({ key, state: "failed" })
        })
    }, SEARCH_DELAY_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [key, needle, lang, remote, online])

  const active = search?.key === key ? search : null
  // `online` and `remote` are in the condition, not just the tag. Going offline
  // mid-request aborts the fetch, and an abort deliberately sets no state, so a
  // bare `state === "loading"` would stay true for as long as the signal is
  // gone - spinning forever and, because the spinner occupies the clear
  // button's slot, taking the X away in the one situation whose own copy tells
  // the reporter to give up on search.
  const loading = active?.state === "loading" && online && remote
  const failed = active?.state === "failed" && online && remote
  const results = active?.state === "done" ? active.places : NO_PLACES

  /**
   * The twenty-two areas, matched in memory. This is the half that survives a
   * dead signal, so it filters from the first character rather than waiting for
   * the three the remote half needs.
   */
  const areas = React.useMemo<PlaceDto[]>(() => {
    const folded = fold(needle)
    if (!folded) return []
    return lgus
      .filter((lgu) => fold(lgu.name).includes(folded))
      .map((lgu) => ({
        id: `lgu:${lgu.slug}`,
        label: lgu.name,
        context: null,
        lat: lgu.lat,
        lng: lgu.lng,
        kind: "area" as const,
        area: lgu.slug,
      }))
  }, [lgus, needle])

  // Empty groups are omitted entirely rather than rendered hollow, so
  // Combobox.Empty fires on a genuinely empty list.
  const items = React.useMemo<Group[]>(() => {
    const groups: Group[] = []
    if (areas.length > 0) groups.push({ value: "areas", items: areas })
    if (results.length > 0) groups.push({ value: "places", items: results })
    return groups
  }, [areas, results])

  /**
   * Whether "No place found" is the truth right now.
   *
   * Base UI renders Combobox.Empty's children whenever the filtered list is
   * empty, full stop - it cannot tell "the geocoder answered with nothing" from
   * "we have not asked yet". Untyped, below the floor, still searching, offline
   * or failed all produce an empty list too, and in every one of those the
   * status line above already says something truer. Left ungated it contradicts
   * itself out loud, since Status and Empty are both aria-live regions.
   */
  const searched =
    remote && online && !loading && !failed && needle.length >= MIN_CHARS

  const status = !online
    ? t.placeSearch.offline
    : failed
      ? t.placeSearch.error
      : loading
        ? t.placeSearch.searching
        : null

  return (
    <Combobox.Root<PlaceDto>
      items={items}
      // Both halves are already filtered: the server filtered the remote group
      // and `areas` filtered the local one. Base UI's own filter would cut them
      // a second time against the raw input text and silently drop good hits -
      // "guagua public market" matches nothing in the label "Guagua Public
      // Market" once the geocoder has already decided it is the answer.
      filter={null}
      // The selection is deliberately left UNCONTROLLED. Passing `value={null}`
      // reads like "never hold a selection" and does something else entirely:
      // null counts as controlled, so `selectedValue` is pinned at null, and
      // Base UI derives two things from it. Combobox.Clear is `visible =
      // selectedValue != null` for a single select, so the X never renders at
      // all; and closing the popup restores the input to the selected item's
      // label, which for null is the empty string - so the field blanked itself
      // immediately after every pick. Uncontrolled, the field keeps the name
      // that was chosen and the X clears it.
      onValueChange={(place) => {
        if (!place) return
        settledRef.current = place.label
        onSelect(place)
      }}
      inputValue={query}
      onInputValueChange={setQuery}
      itemToStringLabel={(place) => place.label}
      openOnInputClick
      // Deliberately no `name`: a named root renders a hidden input, and this
      // control sits inside the report form, which would then post it.
    >
      <div className={styles.field}>
        <MagnifyingGlassIcon size={16} className={styles.icon} />
        <Combobox.Input
          className={styles.input}
          aria-label={t.placeSearch.label}
          placeholder={t.placeSearch.placeholder}
          autoComplete="off"
          onKeyDown={(event) => {
            // The whole page is one <form onSubmit={submit} noValidate>, so
            // Enter here fires implicit submission and would FILE THE REPORT.
            // Base UI's own handler explicitly allows that when no item is
            // highlighted ("Allow form submission when no item is highlighted")
            // and does not run at all while the popup is closed. Ours runs
            // first - mergeProps puts the element's own props last and calls
            // them before its own - so preventing the default here stops the
            // submit while Base UI still selects the highlighted row after us.
            // Do NOT call event.preventBaseUIHandler(): that is what would.
            if (event.key === "Enter") event.preventDefault()
          }}
        />
        {loading ? (
          <CircleNotchIcon size={16} className={styles.spinner} />
        ) : query ? (
          <Combobox.Clear
            type="button"
            className={styles.clear}
            aria-label={t.placeSearch.clear}
          >
            <XIcon size={14} weight="bold" />
          </Combobox.Clear>
        ) : null}
      </div>

      <Combobox.Portal>
        <Combobox.Positioner
          side="bottom"
          align="start"
          sideOffset={6}
          className={styles.positioner}
        >
          <Combobox.Popup className={styles.popup}>
            {/* Status and Empty must stay mounted to announce politely: swap
                their children, never the element. `.status:empty` hides the
                box without hiding it from a screen reader. */}
            <Combobox.Status
              className={`${styles.status} ${!online ? styles.statusOffline : ""}`}
            >
              {status}
            </Combobox.Status>
            {/* Children swapped rather than the element, per Base UI's own
                note: the node has to stay mounted to announce reliably. */}
            <Combobox.Empty className={styles.empty}>
              {searched ? (
                <>
                  <span className={styles.emptyTitle}>
                    {t.placeSearch.empty}
                  </span>
                  <span className={styles.emptySub}>
                    {t.placeSearch.emptySub}
                  </span>
                </>
              ) : null}
            </Combobox.Empty>
            <Combobox.List>
              {(group: Group) => (
                <Combobox.Group
                  key={group.value}
                  items={group.items}
                  className={styles.group}
                >
                  <Combobox.GroupLabel className={styles.groupLabel}>
                    {group.value === "areas"
                      ? t.placeSearch.areas
                      : t.placeSearch.places}
                  </Combobox.GroupLabel>
                  {group.items.map((place) => (
                    <Combobox.Item
                      key={place.id}
                      value={place}
                      className={styles.row}
                    >
                      <MapPinIcon size={15} className={styles.rowIcon} />
                      <span className={styles.rowText}>
                        <span className={styles.rowLabel}>{place.label}</span>
                        {place.context ? (
                          <span className={styles.rowContext}>
                            {place.context}
                          </span>
                        ) : null}
                      </span>
                    </Combobox.Item>
                  ))}
                </Combobox.Group>
              )}
            </Combobox.List>
            {/* An ODbL obligation, not decoration. Do not tidy it away. */}
            <div className={styles.attribution}>
              {t.placeSearch.attribution}
            </div>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
