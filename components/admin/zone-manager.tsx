"use client"

import * as React from "react"
import {
  PencilSimpleIcon,
  PlusIcon,
  ShieldIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react"

import styles from "@/components/admin/zone-manager.module.css"
import { FloodMap, type MapPoint } from "@/components/map/flood-map"
import { useLanguage } from "@/components/providers/language-provider"
import { useSocketEvent } from "@/components/providers/socket-provider"
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
import { api } from "@/lib/client-api"
import {
  PICKER_ZOOM,
  PROVINCE_CENTER,
  PROVINCE_ZOOM,
  ZONE_COLOR,
  ZONE_TYPES,
  formatCoords,
  formatCount,
  type ZoneType,
} from "@/lib/domain"
import type { LguDto, ZoneDto } from "@/lib/dto"

const byName = (a: ZoneDto, b: ZoneDto) => a.name.localeCompare(b.name)

/** Zones changed since this page was rendered: a row, or null once deleted. */
type LiveZones = ReadonlyMap<string, ZoneDto | null>

/** null means "add a new zone"; a zone means "edit this one". */
type DialogState = { zone: ZoneDto | null }

export function ZoneManager({
  lgus,
  zones: serverZones,
  scopeSlug,
}: {
  lgus: LguDto[]
  zones: ZoneDto[]
  scopeSlug: string
}) {
  const { t } = useLanguage()
  const [live, setLive] = React.useState<LiveZones>(() => new Map())
  const [dialog, setDialog] = React.useState<DialogState | null>(null)

  // Live changes are merged with the server list during render rather than
  // copied into state, so a refresh cannot resurrect a deleted zone.
  const zones = React.useMemo(() => {
    const merged = new Map(serverZones.map((zone) => [zone.id, zone]))
    for (const [id, zone] of live) {
      if (zone) merged.set(id, zone)
      else merged.delete(id)
    }
    return [...merged.values()].sort(byName)
  }, [serverZones, live])

  const apply = React.useCallback(
    (id: string, zone: ZoneDto | null) =>
      setLive((current) => new Map(current).set(id, zone)),
    []
  )

  // Two officers can be editing the province at the same time.
  useSocketEvent("zone:created", (zone) => apply(zone.id, zone))
  useSocketEvent("zone:updated", (zone) => apply(zone.id, zone))
  useSocketEvent("zone:deleted", ({ id }) => apply(id, null))

  async function remove(zone: ZoneDto) {
    try {
      await api.deleteZone(zone.id)
      apply(zone.id, null)
      showToast(t.toast.zoneDel, t.toast.zoneDelSub, "ok")
    } catch {
      showToast(t.toast.error, t.toast.errorSub, "warn")
    }
  }

  return (
    <div className={styles.list}>
      <Button
        type="button"
        className={styles.addButton}
        onClick={() => setDialog({ zone: null })}
      >
        <PlusIcon size={17} weight="bold" className={styles.addIcon} />
        {t.admin.addZone}
      </Button>

      {zones.map((zone) => {
        const capacity = zone.capacity
          ? `${formatCount(zone.occupancy)} ${t.zone.occ} / ${formatCount(
              zone.capacity
            )} ${t.zone.cap.toLowerCase()}`
          : "-"
        const contact = [zone.contactName, zone.contactPhone]
          .filter((part) => part)
          .join(" · ")

        return (
          <div key={zone.id} className={styles.card}>
            <span
              className={styles.tile}
              style={{ background: ZONE_COLOR[zone.type] }}
            >
              <ShieldIcon size={19} weight="regular" />
            </span>

            <div className={styles.body}>
              <div className={styles.nameRow}>
                <span className={styles.name}>{zone.name}</span>
                <span className={styles.pill}>{t.zone[zone.type]}</span>
              </div>
              <span className={styles.coords}>
                {formatCoords(zone.lat, zone.lng, 4)}
              </span>
              <span className={styles.meta}>
                {capacity}
                {contact ? `  ·  ${contact}` : ""}
              </span>
            </div>

            <div className={styles.actions}>
              <Button
                type="button"
                variant="outline"
                className={styles.edit}
                onClick={() => setDialog({ zone })}
              >
                <PencilSimpleIcon
                  size={15}
                  weight="regular"
                  className={styles.actionIcon}
                />
                {t.report.edit}
              </Button>
              <Button
                type="button"
                variant="outline"
                className={styles.delete}
                onClick={() => remove(zone)}
              >
                <TrashIcon
                  size={15}
                  weight="regular"
                  className={styles.actionIcon}
                />
                {t.report.delete}
              </Button>
            </div>
          </div>
        )
      })}

      {dialog ? (
        <ZoneDialog
          key={dialog.zone?.id ?? "new"}
          zone={dialog.zone}
          lgus={lgus}
          zones={zones}
          scopeSlug={scopeSlug}
          onClose={() => setDialog(null)}
          onSaved={(zone) => {
            apply(zone.id, zone)
            setDialog(null)
            showToast(t.toast.zone, t.toast.zoneSub, "ok")
          }}
        />
      ) : null}
    </div>
  )
}

function ZoneDialog({
  zone,
  lgus,
  zones,
  scopeSlug,
  onClose,
  onSaved,
}: {
  zone: ZoneDto | null
  lgus: LguDto[]
  zones: ZoneDto[]
  scopeSlug: string
  onClose: () => void
  onSaved: (zone: ZoneDto) => void
}) {
  const { t } = useLanguage()
  const fieldId = React.useId()

  const [name, setName] = React.useState(zone?.name ?? "")
  const [type, setType] = React.useState<ZoneType>(zone?.type ?? "SHELTER")
  const [capacity, setCapacity] = React.useState(
    zone?.capacity != null ? String(zone.capacity) : ""
  )
  // The prototype was already scoped to one LGU; a province-wide panel has to
  // ask which area the zone belongs to.
  const [lguSlug, setLguSlug] = React.useState(zone?.lguSlug ?? scopeSlug)
  const [point, setPoint] = React.useState<MapPoint | null>(
    zone ? { lat: zone.lat, lng: zone.lng } : null
  )
  const [contactName, setContactName] = React.useState(zone?.contactName ?? "")
  const [contactPhone, setContactPhone] = React.useState(
    zone?.contactPhone ?? ""
  )
  const [saving, setSaving] = React.useState(false)

  const area = lgus.find((lgu) => lgu.slug === lguSlug)
  const focus = React.useMemo(
    () =>
      area
        ? { lat: area.lat, lng: area.lng, zoom: PICKER_ZOOM }
        : { ...PROVINCE_CENTER, zoom: PROVINCE_ZOOM },
    [area]
  )

  const typeLabels = Object.fromEntries(
    ZONE_TYPES.map((value) => [value, t.zone[value]])
  )
  const areaLabels = Object.fromEntries(lgus.map((lgu) => [lgu.slug, lgu.name]))

  // Save stays live, as the design draws it - pressing it is how an officer
  // finds out what is missing. The dictionary already carries both messages.
  async function save() {
    const missingName = name.trim().length < 2
    if (missingName || !point) {
      showToast(t.toast.error, missingName ? t.err.name : t.err.pin, "warn")
      return
    }
    if (saving) return
    setSaving(true)
    try {
      const input = {
        lguSlug,
        name: name.trim(),
        type,
        lat: point.lat,
        lng: point.lng,
        capacity: capacity === "" ? null : Number(capacity),
        contactName: contactName.trim() || null,
        contactPhone: contactPhone.trim() || null,
      }
      const saved = zone
        ? await api.updateZone(zone.id, input)
        : await api.createZone({ ...input, occupancy: 0 })
      onSaved(saved.zone)
    } catch {
      showToast(t.toast.error, t.toast.errorSub, "warn")
      setSaving(false)
    }
  }

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
            {zone ? t.admin.editZone : t.admin.addZone}
          </DialogTitle>
          <Button
            type="button"
            variant="ghost"
            aria-label={t.common.close}
            className={styles.close}
            onClick={onClose}
          >
            <XIcon size={18} weight="bold" className={styles.closeIcon} />
          </Button>
        </div>

        <div className={styles.field}>
          <Label className={styles.label} htmlFor={`${fieldId}-name`}>
            {t.admin.zName}
          </Label>
          <Input
            id={`${fieldId}-name`}
            className={styles.input}
            value={name}
            placeholder={t.admin.zNamePh}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className={styles.row}>
          <div className={`${styles.field} ${styles.wide}`}>
            <Label className={styles.label} htmlFor={`${fieldId}-type`}>
              {t.admin.zType}
            </Label>
            <Select
              items={typeLabels}
              value={type}
              onValueChange={(value) => {
                if (value !== null) setType(value)
              }}
            >
              <SelectTrigger id={`${fieldId}-type`} className={styles.select}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {ZONE_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t.zone[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={`${styles.field} ${styles.narrow}`}>
            <Label className={styles.label} htmlFor={`${fieldId}-capacity`}>
              {t.admin.zCap}
            </Label>
            <Input
              id={`${fieldId}-capacity`}
              className={styles.input}
              value={capacity}
              inputMode="numeric"
              placeholder={t.admin.zCapPh}
              onChange={(event) =>
                setCapacity(event.target.value.replace(/[^0-9]/g, ""))
              }
            />
          </div>
        </div>

        <div className={styles.field}>
          <Label className={styles.label} htmlFor={`${fieldId}-area`}>
            {t.submit.lgu}
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
          <span className={styles.label}>{t.submit.where}</span>
          <div className={styles.map}>
            <FloodMap
              mode="picker"
              level="lgu"
              focus={focus}
              zones={zones}
              labels={false}
              pickedPoint={point}
              onPick={setPoint}
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={`${styles.field} ${styles.wide}`}>
            <Label className={styles.label} htmlFor={`${fieldId}-contact`}>
              {t.admin.zContact}
            </Label>
            <Input
              id={`${fieldId}-contact`}
              className={styles.input}
              value={contactName}
              placeholder={t.admin.zContactPh}
              onChange={(event) => setContactName(event.target.value)}
            />
          </div>

          <div className={`${styles.field} ${styles.mid}`}>
            <Label className={styles.label} htmlFor={`${fieldId}-phone`}>
              {t.admin.zPhone}
            </Label>
            <Input
              id={`${fieldId}-phone`}
              className={styles.input}
              value={contactPhone}
              inputMode="tel"
              placeholder={t.admin.zPhonePh}
              onChange={(event) => setContactPhone(event.target.value)}
            />
          </div>
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
            {t.admin.save}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
