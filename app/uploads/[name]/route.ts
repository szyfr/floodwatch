import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { join } from "node:path"
import { Readable } from "node:stream"

import { notFound } from "@/lib/api"
import { CONTENT_TYPES, UPLOAD_DIR, isUploadName } from "@/lib/server/uploads"

type Context = { params: Promise<{ name: string }> }

/**
 * Serves report photos from `var/uploads`. They cannot live in `public/`:
 * Next indexes that folder once at startup, so anything uploaded afterwards
 * would 404 in production.
 */
export async function GET(_request: Request, { params }: Context) {
  const { name } = await params
  if (!isUploadName(name)) return notFound("No such photo")

  const path = join(UPLOAD_DIR, name)
  let size: number
  try {
    const info = await stat(path)
    if (!info.isFile()) return notFound("No such photo")
    size = info.size
  } catch {
    return notFound("No such photo")
  }

  const extension = name.split(".").pop()!.toLowerCase()
  const stream = Readable.toWeb(
    createReadStream(path)
  ) as unknown as ReadableStream<Uint8Array>

  return new Response(stream, {
    headers: {
      "content-type": CONTENT_TYPES[extension] ?? "application/octet-stream",
      "content-length": String(size),
      // The name is a UUID, so the bytes behind it never change.
      "cache-control": "public, max-age=31536000, immutable",
    },
  })
}
