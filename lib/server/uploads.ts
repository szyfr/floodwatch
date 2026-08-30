import "server-only"

import { createReadStream } from "node:fs"
import { mkdir, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Readable } from "node:stream"

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"

/**
 * Report photos live outside `public/`: Next indexes that folder once at
 * startup in production, so a file written after boot would 404. They are
 * written by app/api/uploads/route.ts and read back by
 * app/uploads/[name]/route.ts.
 *
 * Bytes live in S3 when S3_BUCKET is set, and on local disk otherwise - so a
 * development machine needs no AWS credentials and no bucket.
 *
 * Either way the public URL stays `/uploads/<uuid>.<ext>`, a same-origin path.
 * That is load-bearing, not cosmetic: `photoUrlField` in lib/validation.ts
 * accepts only same-origin paths, because POST /api/reports takes `photoUrl`
 * straight from the client. An absolute URL there would let someone bypass this
 * route's type and magic-byte checks and point every viewer's browser at
 * anything they liked.
 */
export const UPLOAD_DIR = join(process.cwd(), "var", "uploads")

const BUCKET = process.env.S3_BUCKET
/** Key prefix inside the bucket, so it can hold more than just photos. */
const KEY_PREFIX = process.env.S3_UPLOAD_PREFIX ?? "uploads/"

/** True when photos go to S3. Used by the health surface and the docs. */
export const usesS3 = Boolean(BUCKET)

let client: S3Client | null = null
/** Region comes from AWS_REGION, credentials from the instance role via IMDS. */
function s3(): S3Client {
  client ??= new S3Client({})
  return client
}

const keyFor = (name: string) => `${KEY_PREFIX}${name}`

/** Filenames are UUIDs we minted, so anything else is not ours to serve. */
const NAME = /^[0-9a-f-]{36}\.(jpg|png)$/i

export function isUploadName(name: string): boolean {
  return NAME.test(name)
}

export function uploadUrl(name: string): string {
  return `/uploads/${name}`
}

export const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
}

/** A stored photo, ready to stream back. `size` is null when unknown. */
export type StoredUpload = {
  stream: ReadableStream<Uint8Array>
  size: number | null
}

const toWeb = (readable: Readable) =>
  Readable.toWeb(readable) as unknown as ReadableStream<Uint8Array>

export async function putUpload(
  name: string,
  bytes: Buffer,
  contentType: string
): Promise<void> {
  if (BUCKET) {
    await s3().send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: keyFor(name),
        Body: bytes,
        ContentType: contentType,
        // The name is a UUID, so the bytes behind it never change.
        CacheControl: "public, max-age=31536000, immutable",
      })
    )
    return
  }

  await mkdir(UPLOAD_DIR, { recursive: true })
  await writeFile(join(UPLOAD_DIR, name), bytes)
}

/**
 * Where a photo lives in S3, or null when photos are on local disk. Moderation
 * needs the bucket and key, and only runs in S3 mode.
 */
export function uploadStorageRef(
  name: string
): { bucket: string; key: string } | null {
  return BUCKET ? { bucket: BUCKET, key: keyFor(name) } : null
}

/** Used to take back a photo that moderation rejected after it was stored. */
export async function deleteUpload(name: string): Promise<void> {
  if (BUCKET) {
    await s3().send(
      new DeleteObjectCommand({ Bucket: BUCKET, Key: keyFor(name) })
    )
    return
  }
  await rm(join(UPLOAD_DIR, name), { force: true })
}

export async function getUpload(name: string): Promise<StoredUpload | null> {
  if (BUCKET) {
    const found = await getFromS3(BUCKET, name)
    if (found) return found
    // Fall through to disk. Photos uploaded before the move to S3 are still
    // referenced by their rows, so they must keep resolving. Once
    // `aws s3 sync var/uploads s3://<bucket>/uploads/` has run and you are
    // confident nothing is left, this fallback can go.
  }
  return getFromDisk(name)
}

async function getFromS3(
  bucket: string,
  name: string
): Promise<StoredUpload | null> {
  try {
    const out = await s3().send(
      new GetObjectCommand({ Bucket: bucket, Key: keyFor(name) })
    )
    if (!out.Body) return null
    return {
      stream: toWeb(out.Body as Readable),
      size: out.ContentLength ?? null,
    }
  } catch (error) {
    // A miss is expected while old photos are still on disk; anything else is
    // a real fault (credentials, region, permissions) and worth the journal.
    const name = (error as { name?: string }).name
    if (name !== "NoSuchKey" && name !== "NotFound") {
      console.error("[uploads] S3 read failed", error)
    }
    return null
  }
}

async function getFromDisk(name: string): Promise<StoredUpload | null> {
  const path = join(UPLOAD_DIR, name)
  try {
    const info = await stat(path)
    if (!info.isFile()) return null
    return { stream: toWeb(createReadStream(path)), size: info.size }
  } catch {
    return null
  }
}
