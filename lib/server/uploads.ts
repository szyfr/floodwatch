import "server-only"

import { join } from "node:path"

/**
 * Report photos live outside `public/`. Next indexes the public folder once at
 * startup in production, so a file written after boot would 404 — they are
 * served by app/uploads/[name]/route.ts instead.
 */
export const UPLOAD_DIR = join(process.cwd(), "var", "uploads")

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
