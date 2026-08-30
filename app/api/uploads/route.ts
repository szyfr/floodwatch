import { randomUUID } from "node:crypto"

import type { NextRequest } from "next/server"

import { apiError, json, requireUser } from "@/lib/api"
import { PHOTO_MAX_BYTES } from "@/lib/domain"
import { moderatePhoto } from "@/lib/server/moderation"
import {
  CONTENT_TYPES,
  deleteUpload,
  putUpload,
  uploadStorageRef,
  uploadUrl,
} from "@/lib/server/uploads"

/**
 * The only two formats the submit form offers, with the extension we write.
 * Maps, not objects — the key comes from the client, and a plain object lookup
 * would walk Object.prototype for a part declaring `Content-Type: constructor`.
 */
const ACCEPTED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
])

const SIGNATURES = new Map([
  ["jpg", [0xff, 0xd8, 0xff]],
  ["png", [0x89, 0x50, 0x4e, 0x47]],
])

/** Multipart framing around a 5MB file, generously. */
const MAX_BODY_BYTES = PHOTO_MAX_BYTES + 64 * 1024

/** 422 with the key the form shows as `t.err.photo`. */
const rejected = () =>
  apiError("That photo was not accepted", 422, {
    code: "INVALID",
    fields: { file: "photo" },
  })

export async function POST(request: NextRequest) {
  const auth = await requireUser()
  if (auth.response) return auth.response

  // Refuse an oversized body before formData() buffers all of it in memory.
  const declaredLength = Number(request.headers.get("content-length") ?? 0)
  if (declaredLength > MAX_BODY_BYTES) return rejected()

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return apiError("Expected a multipart body", 400, { code: "BAD_FORM" })
  }

  const file = form.get("file")
  if (!(file instanceof File)) return rejected()

  const extension = ACCEPTED.get(file.type)
  if (!extension || file.size === 0 || file.size > PHOTO_MAX_BYTES) {
    return rejected()
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  // The declared type is the client's word; the magic bytes are the file's.
  const signature = SIGNATURES.get(extension)
  if (!signature || !signature.every((byte, i) => bytes[i] === byte)) {
    return rejected()
  }

  // The upload's own name never reaches the disk — it decides neither the
  // filename nor the extension, so it cannot escape the upload directory.
  const name = `${randomUUID()}.${extension}`
  try {
    // The stored content type comes from the extension we just validated, not
    // from the client's declared type — the same reason the magic bytes are
    // checked above.
    await putUpload(name, bytes, CONTENT_TYPES[extension])
  } catch (error) {
    console.error("[uploads] could not store photo", error)
    return apiError("Could not store that photo", 502, { code: "STORAGE" })
  }

  // Moderation runs against the stored object, so a rejected photo has to be
  // taken back off S3. It fails open — see lib/server/moderation.ts.
  const ref = uploadStorageRef(name)
  if (ref) {
    const verdict = await moderatePhoto(ref.bucket, ref.key)
    if (verdict.blocked) {
      console.warn(
        `[moderation] rejected ${name}: ${verdict.labels.join("; ")}`
      )
      await deleteUpload(name).catch((error) =>
        console.error("[moderation] could not delete rejected photo", error)
      )
      return rejected()
    }
  }

  return json({ url: uploadUrl(name) })
}
