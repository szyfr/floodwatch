import { notFound } from "@/lib/api"
import { CONTENT_TYPES, getUpload, isUploadName } from "@/lib/server/uploads"

type Context = { params: Promise<{ name: string }> }

/**
 * Serves report photos. They cannot live in `public/`: Next indexes that folder
 * once at startup, so anything uploaded afterwards would 404 in production.
 *
 * The bytes come from S3 or from local disk depending on configuration - see
 * lib/server/uploads.ts. The URL shape stays the same either way, which is what
 * lets photoUrl remain a same-origin path (lib/validation.ts).
 */
export async function GET(_request: Request, { params }: Context) {
  const { name } = await params
  if (!isUploadName(name)) return notFound("No such photo")

  const stored = await getUpload(name)
  if (!stored) return notFound("No such photo")

  const extension = name.split(".").pop()!.toLowerCase()
  const headers = new Headers({
    "content-type": CONTENT_TYPES[extension] ?? "application/octet-stream",
    // The name is a UUID, so the bytes behind it never change.
    "cache-control": "public, max-age=31536000, immutable",
  })
  if (stored.size !== null) headers.set("content-length", String(stored.size))

  return new Response(stored.stream, { headers })
}
