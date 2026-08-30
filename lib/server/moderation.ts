import "server-only"

import {
  DetectModerationLabelsCommand,
  RekognitionClient,
} from "@aws-sdk/client-rekognition"

/**
 * Content moderation for report photos, via Rekognition's DetectModerationLabels.
 *
 * Runs against the S3 object rather than raw bytes: the Bytes form of the API
 * caps at 5 MB while PHOTO_MAX_BYTES is 5 MiB, so the largest photos this app
 * accepts would fail that path. The consequence is that a rejected photo has
 * already been stored when the verdict arrives, so the caller deletes it.
 *
 * Two deliberate policies:
 *
 * It FAILS OPEN. A Rekognition outage, a timeout, or a missing permission logs
 * and allows the photo through. This is a flood-warning service — during the
 * event it exists for, being unable to file a report is worse than an
 * unmoderated photo reaching the map.
 *
 * It blocks EVERY category by default. REKOGNITION_ALLOW_CATEGORIES is the
 * escape hatch, because AWS's taxonomy is broad and some of it collides badly
 * with disaster imagery — "Violence" reads rescue scenes and wrecked vehicles,
 * and "Visually Disturbing" covers injuries, blood and drowned livestock, which
 * is precisely what a DRRM officer most needs to see. When real reports start
 * being rejected, add those category names to the allow list and restart; no
 * rebuild is needed, since none of these are NEXT_PUBLIC_.
 */
const ENABLED = process.env.REKOGNITION_MODERATION === "on"

/** Labels below this confidence are not returned by the API at all. */
const MIN_CONFIDENCE = Number(process.env.REKOGNITION_MIN_CONFIDENCE ?? 80)

/** Top-level categories to allow through, comma separated. Case-insensitive. */
const ALLOWED = new Set(
  (process.env.REKOGNITION_ALLOW_CATEGORIES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
)

/** A hung moderation call must not hold an upload open. */
const TIMEOUT_MS = Number(process.env.REKOGNITION_TIMEOUT_MS ?? 5000)

export const moderationEnabled = ENABLED

let client: RekognitionClient | null = null
function rekognition(): RekognitionClient {
  client ??= new RekognitionClient({})
  return client
}

export type ModerationVerdict = {
  blocked: boolean
  /** Every label the API returned, for the journal — "Category / Label 98.2%". */
  labels: string[]
}

const ALLOW: ModerationVerdict = { blocked: false, labels: [] }

export async function moderatePhoto(
  bucket: string,
  key: string
): Promise<ModerationVerdict> {
  if (!ENABLED) return ALLOW

  try {
    const out = await rekognition().send(
      new DetectModerationLabelsCommand({
        Image: { S3Object: { Bucket: bucket, Name: key } },
        MinConfidence: MIN_CONFIDENCE,
      }),
      { abortSignal: AbortSignal.timeout(TIMEOUT_MS) }
    )

    const found = out.ModerationLabels ?? []
    const labels = found.map(
      (l) =>
        `${l.ParentName || l.Name} / ${l.Name} ${(l.Confidence ?? 0).toFixed(1)}%`
    )

    // A top-level label reports no ParentName, so it is its own category.
    const blocked = found.some(
      (l) => !ALLOWED.has((l.ParentName || l.Name || "").toLowerCase())
    )

    return { blocked, labels }
  } catch (error) {
    console.error("[moderation] check failed, allowing photo", error)
    return ALLOW
  }
}
