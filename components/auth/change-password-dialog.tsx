"use client"

import * as React from "react"
import { WarningCircleIcon } from "@phosphor-icons/react"

import styles from "@/components/auth/change-password-dialog.module.css"
import { useLanguage } from "@/components/providers/language-provider"
import { showToast } from "@/components/toast"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiRequestError, api } from "@/lib/client-api"
import { authMessage } from "@/lib/i18n/dictionary"
import { changePasswordSchema, fieldErrors } from "@/lib/validation"

/**
 * Changing your own password, from anywhere in the app.
 *
 * Lives beside the sign-in form rather than in the officials' console because
 * it belongs to every account: a resident reaches it from the nav drawer, and
 * an officer gets the same dialog for their own row rather than the reset one
 * they use on everybody else's — their current password is something they are
 * expected to have.
 */
export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const fieldId = React.useId()

  const [currentPassword, setCurrentPassword] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [pending, setPending] = React.useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const input = { currentPassword, password, confirmPassword }
    // Checked here against the same schema the endpoint uses, so a mistyped
    // confirmation is caught without sending the password anywhere.
    const parsed = changePasswordSchema.safeParse(input)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }

    setErrors({})
    setPending(true)
    try {
      await api.changePassword(input)
      showToast(t.users.changed, t.users.changedSub, "ok")
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
      setPending(false)
    }
  }

  const rows: {
    key: string
    label: string
    value: string
    set: (value: string) => void
    autoComplete: string
  }[] = [
    {
      key: "currentPassword",
      label: t.users.current,
      value: currentPassword,
      set: setCurrentPassword,
      autoComplete: "current-password",
    },
    {
      key: "password",
      label: t.users.newPass,
      value: password,
      set: setPassword,
      autoComplete: "new-password",
    },
    {
      key: "confirmPassword",
      label: t.auth.confirm,
      value: confirmPassword,
      set: setConfirmPassword,
      autoComplete: "new-password",
    },
  ]

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className={styles.dialog} showCloseButton={false}>
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.head}>
            <DialogTitle className={styles.title}>
              {t.users.changeTitle}
            </DialogTitle>
            <span className={styles.sub}>{t.users.changeSub}</span>
          </div>

          {rows.map((row) => {
            const message = authMessage(t, errors[row.key])
            return (
              <div key={row.key} className={styles.field}>
                <Label
                  className={styles.label}
                  htmlFor={`${fieldId}-${row.key}`}
                >
                  {row.label}
                </Label>
                <Input
                  id={`${fieldId}-${row.key}`}
                  className={styles.input}
                  type="password"
                  value={row.value}
                  autoComplete={row.autoComplete}
                  aria-invalid={message ? true : undefined}
                  onChange={(event) => row.set(event.target.value)}
                />
                {message ? (
                  <span role="alert" className={styles.error}>
                    <WarningCircleIcon size={14} weight="bold" />
                    {message}
                  </span>
                ) : null}
              </div>
            )
          })}

          <span className={styles.hint}>{t.auth.errPass}</span>

          <div className={styles.footer}>
            <Button
              type="button"
              variant="outline"
              className={styles.cancel}
              onClick={onClose}
            >
              {t.report.cancel}
            </Button>
            <Button type="submit" className={styles.save} disabled={pending}>
              {pending ? t.auth.working : t.users.change}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
