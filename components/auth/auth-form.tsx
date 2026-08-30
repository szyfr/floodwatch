"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MapPinIcon, WarningCircleIcon } from "@phosphor-icons/react"

import styles from "@/components/auth/auth-form.module.css"
import { useLanguage } from "@/components/providers/language-provider"
import { showToast } from "@/components/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ApiRequestError, api } from "@/lib/client-api"
import type { LguDto } from "@/lib/dto"
import { authMessage } from "@/lib/i18n/dictionary"
import { fieldErrors, signInSchema, signUpSchema } from "@/lib/validation"

export type AuthMode = "signin" | "signup"

type FieldErrors = Record<string, string>

/**
 * `?next` is attacker-controllable, so only a same-origin path survives.
 * "//host" and "/\host" are browser-legal ways to leave the origin.
 */
function safePath(value: string | null): string | null {
  if (!value || !value.startsWith("/")) return null
  if (value.startsWith("//") || value.startsWith("/\\")) return null
  return value
}

function ErrorLine({
  id,
  message,
  alt,
}: {
  id: string
  message: string
  alt: boolean
}) {
  return (
    <span
      id={id}
      role="alert"
      className={`${styles.error} ${alt ? styles.shakeB : styles.shakeA}`}
    >
      <WarningCircleIcon size={14} weight="bold" />
      {message}
    </span>
  )
}

export function AuthForm({
  mode,
  lgus = [],
  next,
}: {
  mode: AuthMode
  /** Only sign-up needs the area list, so sign-in never loads it. */
  lgus?: LguDto[]
  next: string | null
}) {
  const { t } = useLanguage()
  const router = useRouter()

  const [fullName, setFullName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  // The design's native select opens on its first option, so the area is never
  // unset and the "pick an area" branch never has to be rendered.
  const [lguSlug, setLguSlug] = React.useState(() => lgus[0]?.slug ?? "")
  const [errors, setErrors] = React.useState<FieldErrors>({})
  const [shakeAlt, setShakeAlt] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  const isSignUp = mode === "signup"
  const safeNext = safePath(next)
  const destination = safeNext ?? "/dashboard"
  const switchHref = `${isSignUp ? "/signin" : "/signup"}${
    safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""
  }`

  const lguLabels = React.useMemo(
    () => Object.fromEntries(lgus.map((lgu) => [lgu.slug, lgu.name])),
    [lgus]
  )

  const fail = (fields: FieldErrors) => {
    setErrors(fields)
    setShakeAlt((alt) => !alt)
  }

  const send = async (call: () => Promise<unknown>) => {
    setErrors({})
    setPending(true)
    try {
      await call()
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        Object.keys(error.fields).length > 0
      ) {
        fail(error.fields)
      } else {
        // No per-field detail to show - a dropped connection or a 500.
        showToast(t.toast.error, t.toast.errorSub, "warn")
      }
      setPending(false)
      return
    }
    router.push(destination)
    // The session lives in an httpOnly cookie, so the server tree has to be
    // re-rendered before the shell knows who is signed in.
    router.refresh()
  }

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return

    if (isSignUp) {
      const parsed = signUpSchema.safeParse({
        fullName,
        email,
        password,
        confirmPassword,
        lguSlug,
      })
      if (!parsed.success) {
        fail(fieldErrors(parsed.error))
        return
      }
      await send(() => api.signUp(parsed.data))
      return
    }

    const parsed = signInSchema.safeParse({ email, password })
    if (!parsed.success) {
      fail(fieldErrors(parsed.error))
      return
    }
    await send(() => api.signIn(parsed.data))
  }

  const nameError = authMessage(t, errors.fullName)
  const emailError = authMessage(t, errors.email)
  const passwordError = authMessage(t, errors.password)
  const confirmError = authMessage(t, errors.confirmPassword)
  const lguError = authMessage(t, errors.lguSlug)

  return (
    <div className={styles.column}>
      <div className={styles.identity}>
        <span className={styles.mark}>
          <MapPinIcon size={24} />
        </span>
        <span className={styles.brand}>{t.brand}</span>
        <span className={styles.place}>{t.place}</span>
      </div>

      <form className={styles.card} onSubmit={onSubmit} noValidate>
        <div className={styles.heading}>
          <span className={styles.title}>
            {isSignUp ? t.auth.upTitle : t.auth.inTitle}
          </span>
          <span className={styles.subtitle}>
            {isSignUp ? t.auth.upSub : t.auth.inSub}
          </span>
        </div>

        {isSignUp ? (
          <div className={styles.field}>
            <Label className={styles.label} htmlFor="a-name">
              {t.auth.name}
            </Label>
            <Input
              id="a-name"
              className={styles.input}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Rosa Dizon"
              autoComplete="name"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? "a-name-error" : undefined}
            />
            {nameError ? (
              <ErrorLine id="a-name-error" message={nameError} alt={shakeAlt} />
            ) : null}
          </div>
        ) : null}

        <div className={styles.field}>
          <Label className={styles.label} htmlFor="a-email">
            {t.auth.email}
          </Label>
          <Input
            id="a-email"
            className={styles.input}
            type="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="rosa@gmail.com"
            autoComplete="email"
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? "a-email-error" : undefined}
          />
          {emailError ? (
            <ErrorLine id="a-email-error" message={emailError} alt={shakeAlt} />
          ) : null}
        </div>

        <div className={styles.field}>
          <div className={styles.labelRow}>
            <Label className={styles.label} htmlFor="a-pass">
              {t.auth.pass}
            </Label>
            {!isSignUp ? (
              <Button
                type="button"
                variant="link"
                className={styles.forgot}
                onClick={() =>
                  showToast(t.auth.forgotSoon, t.auth.forgotSoonSub, "info")
                }
              >
                {t.auth.forgot}
              </Button>
            ) : null}
          </div>
          <Input
            id="a-pass"
            className={styles.input}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? "a-pass-error" : undefined}
          />
          {passwordError ? (
            <ErrorLine
              id="a-pass-error"
              message={passwordError}
              alt={shakeAlt}
            />
          ) : null}
        </div>

        {isSignUp ? (
          <div className={styles.pair}>
            <div className={styles.field}>
              <Label className={styles.label} htmlFor="a-conf">
                {t.auth.confirm}
              </Label>
              <Input
                id="a-conf"
                className={styles.input}
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                aria-invalid={confirmError ? true : undefined}
                aria-describedby={confirmError ? "a-conf-error" : undefined}
              />
              {confirmError ? (
                <ErrorLine
                  id="a-conf-error"
                  message={confirmError}
                  alt={shakeAlt}
                />
              ) : null}
            </div>

            <div className={styles.field}>
              <Label className={styles.label} htmlFor="a-brgy">
                {t.auth.lgu}
              </Label>
              <Select
                items={lguLabels}
                value={lguSlug}
                onValueChange={(value: string | null) =>
                  setLguSlug(value ?? "")
                }
              >
                <SelectTrigger
                  id="a-brgy"
                  className={styles.select}
                  aria-invalid={lguError ? true : undefined}
                  aria-describedby={lguError ? "a-brgy-error" : undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  className={styles.selectPopup}
                  alignItemWithTrigger={false}
                  align="start"
                >
                  {lgus.map((lgu) => (
                    <SelectItem
                      key={lgu.slug}
                      value={lgu.slug}
                      className={styles.selectItem}
                    >
                      {lgu.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {lguError ? (
                <ErrorLine
                  id="a-brgy-error"
                  message={lguError}
                  alt={shakeAlt}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        <Button type="submit" className={styles.submit} disabled={pending}>
          {pending ? t.auth.working : isSignUp ? t.auth.create : t.auth.signin}
        </Button>

        <div className={styles.switch}>
          {isSignUp ? t.auth.hasAcct : t.auth.noAcct}{" "}
          <Link className={styles.switchLink} href={switchHref}>
            {isSignUp ? t.auth.signin : t.auth.signup}
          </Link>
        </div>
      </form>
    </div>
  )
}
