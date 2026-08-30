"use client"

import * as React from "react"
import { CircleNotchIcon, CrosshairIcon } from "@phosphor-icons/react"

import { useLanguage } from "@/components/providers/language-provider"
import styles from "@/components/submit/locate-button.module.css"
import { formatMetres, ROUGH_FIX_METRES } from "@/lib/domain"
import type { MapPoint } from "@/components/map/flood-map"

/**
 * "Use my location" - the one input on this form that needs no typing, no
 * spelling and no network.
 *
 * It is deliberately NOT disabled when the app is offline. A GPS fix comes off
 * the satellites and the phone's own sensors; the browser may sharpen it with
 * nearby wifi when it can, but a report filed waist-deep in water with no bars
 * is exactly the case this button exists for. Search is the half that needs a
 * signal, and it says so itself.
 *
 * What it does NOT do is move the area select. A map tap does not either, and a
 * tap is the reference behaviour here: place search only reassigns the area
 * because the geocoder hands us the municipality by name, and a coordinate on
 * its own does not. Picking the nearest of twenty-two centroids instead would
 * be wrong precisely at municipal boundaries, which is where flooding gets
 * reported. The area select is visible two fields below and stays the
 * reporter's to set.
 */

/** Long enough for a cold GPS start, short enough to stop staring at a spinner. */
const TIMEOUT_MS = 15_000

/**
 * Our own deadline, because the platform's is narrower than it looks: the spec
 * excludes the time spent waiting for the permission prompt to be answered, and
 * for the document to become visible, from `timeout`. A prompt left sitting
 * unanswered therefore fires NEITHER callback, ever, and without this the
 * button would spin for the rest of the form session and refuse every further
 * press while still looking pressable.
 */
const WATCHDOG_MS = TIMEOUT_MS + 3_000

/** A fix from the last quarter minute is still where the reporter is standing. */
const MAX_AGE_MS = 15_000

/** Which piece of copy a failure earns. See the switch in `locate` below. */
type Failure = "denied" | "unavailable" | "timeout" | "insecure" | "unsupported"

export function LocateButton({
  onLocate,
  lat,
  lng,
}: {
  /** Fires with the fix and its own accuracy in metres, never with neither. */
  onLocate: (point: MapPoint, accuracyMetres: number) => void
  /** The pin as the form holds it, so a fix knows if it has been superseded. */
  lat: string
  lng: string
}) {
  const { t } = useLanguage()
  const [locating, setLocating] = React.useState(false)
  const [failure, setFailure] = React.useState<Failure | null>(null)
  const [accuracy, setAccuracy] = React.useState<number | null>(null)

  /**
   * Stamps each attempt, the way place-search stamps each query.
   *
   * getCurrentPosition cannot be cancelled, so this is how one gets abandoned:
   * bump the id and every callback belonging to the old attempt returns without
   * touching a thing. Unmount, the watchdog and a pin the reporter placed
   * themselves all stand an attempt down this way.
   */
  const attempt = React.useRef(0)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const stop = React.useCallback(() => {
    attempt.current += 1
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  React.useEffect(() => stop, [stop])

  /**
   * The pin as it stands, so a late fix can tell whether it is still wanted.
   *
   * A cold GPS can take the full fifteen seconds, and every failure line on
   * this screen - this component's and the search box's - ends by telling the
   * reporter to tap the map. Doing exactly that and then having the late fix
   * quietly overwrite it is the worst thing this button can do: the coordinate
   * is what gets filed, the map box is usually scrolled off screen by then, and
   * after a search hit the report would keep the searched street as its name
   * while its coordinates moved hundreds of metres away.
   *
   * So a pin placed any other way stands the attempt down. The reporter already
   * has what they pressed the button for, and the note that described the old
   * pin goes with it.
   */
  const pin = `${lat},${lng}`
  const selfWrite = React.useRef(false)
  const seenPin = React.useRef(pin)

  React.useEffect(() => {
    if (pin === seenPin.current) return
    seenPin.current = pin
    // Our own fix landing is not somebody overriding us.
    if (selfWrite.current) {
      selfWrite.current = false
      return
    }
    stop()
    setLocating(false)
    setAccuracy(null)
    setFailure(null)
  }, [pin, stop])

  function locate() {
    if (locating) return
    setFailure(null)
    setAccuracy(null)

    // Both guards produce their own message rather than a generic one. The
    // secure-context case is the same trap newClientId documents in
    // submit-form.tsx: a barangay device may well reach a staging box over
    // plain HTTP, and there the API is not merely blocked, it is absent - so
    // "your phone could not find a location" would send someone hunting a
    // permission prompt that will never appear.
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setFailure("unsupported")
      return
    }
    if (!window.isSecureContext) {
      setFailure("insecure")
      return
    }

    setLocating(true)
    const id = ++attempt.current
    timer.current = setTimeout(() => {
      if (id !== attempt.current) return
      stop()
      setLocating(false)
      setFailure("timeout")
    }, WATCHDOG_MS)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (id !== attempt.current) return
        stop()
        setLocating(false)
        const { latitude, longitude, accuracy: metres } = position.coords
        setAccuracy(metres)
        // Claimed before the write, so the effect above reads the commit that
        // follows as ours rather than as the reporter overriding us.
        selfWrite.current = true
        onLocate({ lat: latitude, lng: longitude }, metres)
      },
      (error) => {
        if (id !== attempt.current) return
        stop()
        setLocating(false)
        // Three causes, three answers. Collapsing them into one line is the
        // mistake photo-upload.tsx already calls out: a blocked permission
        // needs browser settings, a cold GPS needs open sky, and a phone that
        // simply cannot fix needs the map - and only one of the three is worth
        // waiting on.
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setFailure("denied")
            break
          case error.TIMEOUT:
            setFailure("timeout")
            break
          default:
            setFailure("unavailable")
        }
      },
      {
        enableHighAccuracy: true,
        timeout: TIMEOUT_MS,
        maximumAge: MAX_AGE_MS,
      }
    )
  }

  const rough = accuracy !== null && accuracy > ROUGH_FIX_METRES
  // A good fix says so. Silence would make success the one outcome the button
  // never confirms, and on a screen reader the whole interaction would be
  // "Getting your location…" followed by nothing at all.
  const note = failure
    ? t.locate[failure]
    : locating
      ? t.locate.locating
      : accuracy === null
        ? ""
        : rough
          ? t.locate.rough.replace("{distance}", formatMetres(accuracy))
          : t.locate.found

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        onClick={locate}
        aria-busy={locating || undefined}
      >
        {locating ? (
          <CircleNotchIcon size={17} className={styles.spinner} />
        ) : (
          <CrosshairIcon size={17} />
        )}
        {locating ? t.locate.locating : t.locate.button}
      </button>

      {/* Mounted from the start with its text swapped in: a polite live region
          that arrives in the same commit as its content is announced
          unreliably, and every one of these lines is the answer to something
          the reporter just pressed. `:empty` reclaims the gap. */}
      <span
        className={`${styles.note} ${failure ? styles.noteBad : rough ? styles.noteRough : ""}`}
        role="status"
      >
        {note}
      </span>
    </div>
  )
}
