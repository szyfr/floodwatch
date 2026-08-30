"use client"

import * as React from "react"
import {
  BuildingsIcon,
  CalendarBlankIcon,
  ClipboardTextIcon,
  KeyIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PencilSimpleIcon,
  UsersIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"

import { ChangePasswordDialog } from "@/components/auth/change-password-dialog"
import { useLanguage } from "@/components/providers/language-provider"
import { showToast } from "@/components/toast"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import styles from "@/components/users/manage-users-view.module.css"
import { api, ApiRequestError } from "@/lib/client-api"
import {
  MANAGE_PAGE_SIZE,
  USER_ORDERS,
  USER_ROLE_FILTERS,
  formatCount,
  type UserOrder,
  type UserRoleFilter,
} from "@/lib/domain"
import type { LguDto, ManagedUserDto, ManageUsersDto, Role } from "@/lib/dto"
import { authMessage } from "@/lib/i18n/dictionary"
import { fieldErrors, resetPasswordSchema } from "@/lib/validation"

type Filters = {
  q: string
  lgu: string | null
  role: UserRoleFilter
  order: UserOrder
}

/** Sentinel for the "all areas" row — Select wants a string. */
const ANY = "*"

/** Keystrokes settle before the console asks the server again. */
const SEARCH_DELAY_MS = 250

/**
 * A joined date, formatted the same way wherever it is rendered.
 *
 * Fixed parts through an explicit time zone rather than toLocaleDateString:
 * the first page is rendered on the server and hydrated in the reader's
 * browser, and the two disagree about the local zone unless told not to.
 */
const joinedFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Manila",
  day: "numeric",
  month: "short",
  year: "numeric",
})

export function ManageUsersView({
  lgus,
  initialScope,
  initialUsers,
  initialTotal,
}: {
  lgus: LguDto[]
  initialScope: string | null
  initialUsers: ManagedUserDto[]
  initialTotal: number
}) {
  const { t } = useLanguage()

  const [filters, setFilters] = React.useState<Filters>({
    q: "",
    lgu: initialScope,
    role: "all",
    order: "newest",
  })
  // Rows and the count they are a window onto move together, so "Showing 3 of
  // 40" can never contradict the list under it.
  const [page, setPage] = React.useState<ManageUsersDto>({
    users: initialUsers,
    total: initialTotal,
  })
  const { users, total } = page
  const [loading, setLoading] = React.useState(false)
  const [appending, setAppending] = React.useState(false)
  const [editing, setEditing] = React.useState<ManagedUserDto | null>(null)
  const [resetting, setResetting] = React.useState<ManagedUserDto | null>(null)
  const [changingOwn, setChangingOwn] = React.useState(false)

  // Read inside callbacks that must not re-run — and so refetch the page —
  // just because the reader switched language.
  const copy = React.useRef(t)
  React.useEffect(() => {
    copy.current = t
  })

  const failed = React.useCallback(() => {
    showToast(copy.current.toast.error, copy.current.toast.errorSub, "warn")
  }, [])

  const replace = React.useCallback((next: ManagedUserDto) => {
    setPage((current) => ({
      ...current,
      users: current.users.map((user) => (user.id === next.id ? next : user)),
    }))
  }, [])

  const asQuery = React.useCallback(
    (skip: number) => ({
      q: filters.q.trim() || null,
      lgu: filters.lgu,
      role: filters.role,
      order: filters.order,
      skip,
      limit: MANAGE_PAGE_SIZE,
    }),
    [filters]
  )

  // Stamps every request so a slow answer to an old filter cannot overwrite a
  // fast answer to the current one.
  const requestSeq = React.useRef(0)
  // The server already rendered the first page for the filters this starts on.
  const primed = React.useRef(false)

  React.useEffect(() => {
    if (!primed.current) {
      primed.current = true
      return
    }
    const seq = ++requestSeq.current
    setLoading(true)
    const timer = setTimeout(() => {
      api
        .manageUsers(asQuery(0))
        .then((fresh) => {
          if (seq !== requestSeq.current) return
          setPage(fresh)
          setLoading(false)
        })
        .catch(() => {
          if (seq !== requestSeq.current) return
          setLoading(false)
          failed()
        })
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [asQuery, failed])

  async function loadMore() {
    if (appending) return
    const seq = requestSeq.current
    setAppending(true)
    try {
      const next = await api.manageUsers(asQuery(users.length))
      // A filter change while this was in flight owns the list now.
      if (seq !== requestSeq.current) return
      setPage((current) => {
        const seen = new Set(current.users.map((user) => user.id))
        return {
          users: [
            ...current.users,
            ...next.users.filter((user) => !seen.has(user.id)),
          ],
          total: next.total,
        }
      })
    } catch {
      failed()
    } finally {
      setAppending(false)
    }
  }

  const areaLabels: Record<string, string> = {
    [ANY]: t.users.allAreas,
    ...Object.fromEntries(lgus.map((lgu) => [lgu.slug, lgu.name])),
  }
  const roleLabels: Record<UserRoleFilter, string> = {
    all: t.users.allRoles,
    OFFICIAL: t.roles.OFFICIAL,
    RESIDENT: t.roles.RESIDENT,
  }
  const orderLabels: Record<UserOrder, string> = {
    newest: t.users.newest,
    name: t.users.byName,
  }

  const hasMore = users.length < total

  return (
    <div className={styles.page}>
      <div className={styles.column}>
        <div className={styles.heading}>
          <span className={styles.title}>{t.users.title}</span>
          <span className={styles.subtitle}>{t.users.sub}</span>
        </div>

        <div className={styles.controls}>
          <div className={styles.searchWrap}>
            <MagnifyingGlassIcon size={16} className={styles.searchIcon} />
            <Input
              className={styles.search}
              value={filters.q}
              aria-label={t.users.search}
              placeholder={t.users.searchPh}
              onChange={(event) =>
                setFilters((f) => ({ ...f, q: event.target.value }))
              }
            />
          </div>

          <div className={styles.selects}>
            <Select
              items={areaLabels}
              value={filters.lgu ?? ANY}
              onValueChange={(value) => {
                if (value === null) return
                setFilters((f) => ({ ...f, lgu: value === ANY ? null : value }))
              }}
            >
              <SelectTrigger
                className={styles.select}
                aria-label={t.users.area}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectItem value={ANY}>{t.users.allAreas}</SelectItem>
                {lgus.map((lgu) => (
                  <SelectItem key={lgu.slug} value={lgu.slug}>
                    {lgu.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              items={roleLabels}
              value={filters.role}
              onValueChange={(value) => {
                if (value === null) return
                setFilters((f) => ({ ...f, role: value as UserRoleFilter }))
              }}
            >
              <SelectTrigger
                className={styles.select}
                aria-label={t.users.role}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {USER_ROLE_FILTERS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {roleLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              items={orderLabels}
              value={filters.order}
              onValueChange={(value) => {
                if (value === null) return
                setFilters((f) => ({ ...f, order: value as UserOrder }))
              }}
            >
              <SelectTrigger
                className={styles.select}
                aria-label={t.users.order}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {USER_ORDERS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {orderLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <span className={styles.count} aria-live="polite">
            {loading
              ? t.users.loading
              : t.users.showing
                  .replace("{n}", formatCount(users.length))
                  .replace("{total}", formatCount(total))}
          </span>
        </div>

        {users.length === 0 && !loading ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <UsersIcon size={22} weight="regular" />
            </span>
            <span className={styles.emptyTitle}>{t.users.empty}</span>
            <span className={styles.emptySub}>{t.users.emptySub}</span>
          </div>
        ) : (
          <div className={`${styles.list} ${loading ? styles.listBusy : ""}`}>
            {users.map((user) => (
              <div key={user.id} className={styles.card}>
                <span className={styles.avatar} aria-hidden="true">
                  {user.initials}
                </span>

                <div className={styles.body}>
                  <div className={styles.nameRow}>
                    <span className={styles.name}>{user.fullName}</span>
                    <span
                      className={
                        user.role === "OFFICIAL"
                          ? styles.official
                          : styles.resident
                      }
                    >
                      {t.roles[user.role]}
                    </span>
                    {user.isSelf ? (
                      <span className={styles.self}>{t.users.you}</span>
                    ) : null}
                  </div>

                  <span className={styles.email}>{user.email}</span>

                  <div className={styles.meta}>
                    <span className={styles.metaItem}>
                      <MapPinIcon size={13} />
                      {user.lguName}
                    </span>
                    {user.role === "OFFICIAL" ? (
                      <span className={styles.metaItem}>
                        <BuildingsIcon size={13} />
                        {user.organisation ?? t.users.noOrg}
                      </span>
                    ) : null}
                    <span className={styles.metaItem}>
                      <ClipboardTextIcon size={13} />
                      {`${formatCount(user.reportCount)} ${t.users.reports}`}
                    </span>
                    <span className={styles.metaItem}>
                      <CalendarBlankIcon size={13} />
                      {`${t.users.joined} ${joinedFormat.format(new Date(user.createdAt))}`}
                    </span>
                  </div>
                </div>

                <div className={styles.actions}>
                  <Button
                    type="button"
                    variant="outline"
                    className={styles.action}
                    onClick={() => setEditing(user)}
                  >
                    <PencilSimpleIcon size={15} className={styles.actionIcon} />
                    {t.report.edit}
                  </Button>
                  {/* Your own password is changed, not reset: the officer
                      has the current one, so they are asked for it. */}
                  <Button
                    type="button"
                    variant="outline"
                    className={styles.action}
                    onClick={() =>
                      user.isSelf ? setChangingOwn(true) : setResetting(user)
                    }
                  >
                    <KeyIcon size={15} className={styles.actionIcon} />
                    {user.isSelf ? t.users.change : t.users.reset}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {hasMore ? (
          <Button
            type="button"
            variant="outline"
            className={styles.more}
            disabled={appending}
            onClick={loadMore}
          >
            {appending ? t.users.loading : t.users.more}
          </Button>
        ) : null}
      </div>

      {editing ? (
        <EditUserDialog
          key={editing.id}
          user={editing}
          lgus={lgus}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            replace(saved)
            setEditing(null)
          }}
        />
      ) : null}

      {resetting ? (
        <ResetPasswordDialog
          key={resetting.id}
          user={resetting}
          onClose={() => setResetting(null)}
        />
      ) : null}

      {changingOwn ? (
        <ChangePasswordDialog onClose={() => setChangingOwn(false)} />
      ) : null}
    </div>
  )
}

/**
 * What an officer may correct about an account: the name it files reports
 * under, the office it speaks for, the area it belongs to, and the role.
 *
 * The email is not here — it is the identity the account signs in with, so
 * changing it hands the account to someone else rather than fixing a typo.
 */
function EditUserDialog({
  user,
  lgus,
  onClose,
  onSaved,
}: {
  user: ManagedUserDto
  lgus: LguDto[]
  onClose: () => void
  onSaved: (user: ManagedUserDto) => void
}) {
  const { t } = useLanguage()
  const fieldId = React.useId()

  const [fullName, setFullName] = React.useState(user.fullName)
  const [role, setRole] = React.useState<Role>(user.role)
  const [lguSlug, setLguSlug] = React.useState(user.lguSlug)
  const [organisation, setOrganisation] = React.useState(
    user.organisation ?? ""
  )
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  const areaLabels = Object.fromEntries(lgus.map((lgu) => [lgu.slug, lgu.name]))
  const roleLabels: Record<Role, string> = {
    RESIDENT: t.roles.RESIDENT,
    OFFICIAL: t.roles.OFFICIAL,
  }

  async function save() {
    if (saving) return
    const trimmedName = fullName.trim()
    const trimmedOrg = organisation.trim()

    if (trimmedName.length < 2) {
      setErrors({ fullName: "errName" })
      return
    }

    // Only what actually changed is sent: the endpoint refuses an empty patch,
    // and a role field left untouched must not be sent for the viewer's own
    // row, where the server rejects it outright.
    const patch: {
      fullName?: string
      role?: Role
      lguSlug?: string
      organisation?: string | null
    } = {}
    if (trimmedName !== user.fullName) patch.fullName = trimmedName
    if (role !== user.role) patch.role = role
    if (lguSlug !== user.lguSlug) patch.lguSlug = lguSlug
    if (trimmedOrg !== (user.organisation ?? "")) {
      patch.organisation = trimmedOrg || null
    }
    if (Object.keys(patch).length === 0) {
      onClose()
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const { user: saved } = await api.updateUser(user.id, patch)
      showToast(t.users.saved, saved.fullName, "ok")
      onSaved(saved)
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        Object.keys(error.fields).length > 0
      ) {
        setErrors(error.fields)
      } else {
        showToast(t.toast.error, t.toast.errorSub, "warn")
      }
      setSaving(false)
    }
  }

  const nameError = authMessage(t, errors.fullName)
  const roleError = authMessage(t, errors.role)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className={styles.dialog} showCloseButton={false}>
        <div className={styles.dialogHead}>
          <DialogTitle className={styles.dialogTitle}>
            {t.users.edit}
          </DialogTitle>
          <span className={styles.dialogSub}>{t.users.editSub}</span>
          <span className={styles.dialogEmail}>{user.email}</span>
        </div>

        <div className={styles.field}>
          <Label className={styles.label} htmlFor={`${fieldId}-name`}>
            {t.auth.name}
          </Label>
          <Input
            id={`${fieldId}-name`}
            className={styles.input}
            value={fullName}
            aria-invalid={nameError ? true : undefined}
            onChange={(event) => setFullName(event.target.value)}
          />
          {nameError ? (
            <span role="alert" className={styles.error}>
              <WarningCircleIcon size={14} weight="bold" />
              {nameError}
            </span>
          ) : null}
        </div>

        <div className={styles.field}>
          <Label className={styles.label} htmlFor={`${fieldId}-role`}>
            {t.users.role}
          </Label>
          <Select
            items={roleLabels}
            value={role}
            // An officer cannot demote themselves, so the control that would
            // do it is not offered rather than failing on save.
            disabled={user.isSelf}
            onValueChange={(value) => {
              if (value !== null) setRole(value as Role)
            }}
          >
            <SelectTrigger id={`${fieldId}-role`} className={styles.select}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value="RESIDENT">{t.roles.RESIDENT}</SelectItem>
              <SelectItem value="OFFICIAL">{t.roles.OFFICIAL}</SelectItem>
            </SelectContent>
          </Select>
          {user.isSelf ? (
            <span className={styles.hint}>{t.users.selfRole}</span>
          ) : null}
          {roleError ? (
            <span role="alert" className={styles.error}>
              <WarningCircleIcon size={14} weight="bold" />
              {roleError}
            </span>
          ) : null}
        </div>

        <div className={styles.field}>
          <Label className={styles.label} htmlFor={`${fieldId}-area`}>
            {t.auth.lgu}
          </Label>
          <Select
            items={areaLabels}
            value={lguSlug}
            onValueChange={(value) => {
              if (value !== null) setLguSlug(value)
            }}
          >
            <SelectTrigger id={`${fieldId}-area`} className={styles.select}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {lgus.map((lgu) => (
                <SelectItem key={lgu.slug} value={lgu.slug}>
                  {lgu.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={styles.field}>
          <Label className={styles.label} htmlFor={`${fieldId}-org`}>
            {t.users.org}
          </Label>
          <Input
            id={`${fieldId}-org`}
            className={styles.input}
            value={organisation}
            placeholder={t.users.orgPh}
            onChange={(event) => setOrganisation(event.target.value)}
          />
        </div>

        <div className={styles.footer}>
          <Button
            type="button"
            variant="outline"
            className={styles.cancel}
            onClick={onClose}
          >
            {t.report.cancel}
          </Button>
          <Button
            type="button"
            className={styles.save}
            disabled={saving}
            onClick={save}
          >
            {t.users.save}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Setting somebody else's password — the "ask the app admin" path the sign-in
 * screen promises. The officer is not asked for the old password because they
 * do not have it; the new one has to reach the person some other way, which
 * the dialog says out loud rather than implying an email that is never sent.
 */
function ResetPasswordDialog({
  user,
  onClose,
}: {
  user: ManagedUserDto
  onClose: () => void
}) {
  const { t } = useLanguage()
  const fieldId = React.useId()

  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    const input = { password, confirmPassword }
    const parsed = resetPasswordSchema.safeParse(input)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }

    setErrors({})
    setSaving(true)
    try {
      await api.resetUserPassword(user.id, input)
      showToast(t.users.resetDone, t.users.resetDoneSub, "ok")
      onClose()
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        Object.keys(error.fields).length > 0
      ) {
        setErrors(error.fields)
      } else {
        showToast(t.toast.error, t.toast.errorSub, "warn")
      }
      setSaving(false)
    }
  }

  const passwordError = authMessage(t, errors.password)
  const confirmError = authMessage(t, errors.confirmPassword)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className={styles.confirm} showCloseButton={false}>
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.dialogHead}>
            <DialogTitle className={styles.dialogTitle}>
              {t.users.resetTitle}
            </DialogTitle>
            <span className={styles.dialogSub}>{t.users.resetSub}</span>
            <span className={styles.dialogEmail}>
              {`${user.fullName} · ${user.email}`}
            </span>
          </div>

          <div className={styles.field}>
            <Label className={styles.label} htmlFor={`${fieldId}-pass`}>
              {t.users.newPass}
            </Label>
            <Input
              id={`${fieldId}-pass`}
              className={styles.input}
              type="password"
              value={password}
              autoComplete="new-password"
              aria-invalid={passwordError ? true : undefined}
              onChange={(event) => setPassword(event.target.value)}
            />
            {passwordError ? (
              <span role="alert" className={styles.error}>
                <WarningCircleIcon size={14} weight="bold" />
                {passwordError}
              </span>
            ) : null}
          </div>

          <div className={styles.field}>
            <Label className={styles.label} htmlFor={`${fieldId}-confirm`}>
              {t.auth.confirm}
            </Label>
            <Input
              id={`${fieldId}-confirm`}
              className={styles.input}
              type="password"
              value={confirmPassword}
              autoComplete="new-password"
              aria-invalid={confirmError ? true : undefined}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
            {confirmError ? (
              <span role="alert" className={styles.error}>
                <WarningCircleIcon size={14} weight="bold" />
                {confirmError}
              </span>
            ) : null}
          </div>

          <span className={styles.hint}>{t.users.sessionsNote}</span>

          <div className={styles.footer}>
            <Button
              type="button"
              variant="outline"
              className={styles.cancel}
              onClick={onClose}
            >
              {t.report.cancel}
            </Button>
            <Button type="submit" className={styles.save} disabled={saving}>
              {saving ? t.auth.working : t.users.reset}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
