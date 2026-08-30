"use client"

import * as React from "react"
import {
  CircleNotchIcon,
  ImageIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react"

import styles from "@/components/submit/photo-upload.module.css"
import { useLanguage } from "@/components/providers/language-provider"
import { showToast } from "@/components/toast"
import { ApiRequestError, api } from "@/lib/client-api"
import { PHOTO_MAX_BYTES } from "@/lib/domain"

/** A photo already stored on the server. `size` is unknown for an edited report. */
export type AttachedPhoto = { url: string; name: string; size: number | null }

const ACCEPTED = ["image/jpeg", "image/png"]

/** "2.1MB" — the size half of the design's attached-photo label. */
function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`
}

/**
 * The dashed drop area. The file is uploaded the moment it is chosen so the
 * form only ever carries a URL — a queued offline report cannot hold bytes.
 */
export function PhotoUpload({
  photo,
  onChange,
}: {
  photo: AttachedPhoto | null
  onChange: (photo: AttachedPhoto) => void
}) {
  const { t } = useLanguage()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)

  async function acceptFile(input: HTMLInputElement) {
    const file = input.files?.[0]
    // Cleared first so picking the same file again after a failure still fires.
    input.value = ""
    if (!file) return

    if (
      !ACCEPTED.includes(file.type) ||
      file.size === 0 ||
      file.size > PHOTO_MAX_BYTES
    ) {
      showToast(t.toast.error, t.err.photo, "warn")
      return
    }

    setUploading(true)
    try {
      const { url } = await api.upload(file)
      onChange({ url, name: file.name, size: file.size })
    } catch (error) {
      // Three different failures land here and they need different advice.
      // Blaming the file for all of them sends people off to inspect a photo
      // that was never the problem: a storage outage, an expired session and a
      // genuinely rejected file are indistinguishable from the outside.
      const status = error instanceof ApiRequestError ? error.status : 0
      const badFile = status === 400 || status === 413 || status === 422
      showToast(
        t.toast.error,
        status === 0
          ? t.toast.errorSub // no response at all — connection
          : badFile
            ? t.err.photo // the route really did reject this file
            : t.err.generic, // reached us and we failed: storage, auth, 5xx
        "warn"
      )
    } finally {
      setUploading(false)
    }
  }

  const label = photo
    ? photo.size === null
      ? photo.name
      : `${photo.name} · ${formatSize(photo.size)}`
    : t.submit.photoBtn

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className={styles.file}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          void acceptFile(event.currentTarget)
        }}
      />
      <button
        type="button"
        className={`${styles.drop} ${photo ? styles.dropDone : ""}`}
        aria-busy={uploading || undefined}
        onClick={() => {
          if (!uploading) inputRef.current?.click()
        }}
      >
        <span className={styles.icon}>
          {uploading ? (
            <CircleNotchIcon size={20} className={styles.spinner} />
          ) : photo ? (
            <ImageIcon size={20} />
          ) : (
            <UploadSimpleIcon size={20} />
          )}
        </span>
        <span className={styles.label}>{label}</span>
        <span className={styles.hint}>
          {photo ? t.submit.photoDoneHint : t.submit.photoHint}
        </span>
      </button>
    </>
  )
}
