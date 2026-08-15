/**
 * Reminder create/edit form (standalone, for Tracking tab)
 *
 * Mileage input is always an interval ("miles until due"). When currentMileage
 * is available, the form converts interval → absolute on submit. On edit, it
 * reverse-computes the remaining interval for display.
 *
 * The engine-hours target (Task 15, revised) mirrors this exactly for parity:
 * it is also an interval ("engine-hours until due"), converted to an absolute
 * due_hours using the currentHours baseline (from useLatestHours) when one is
 * available, with the same edit-time reverse-computation. Hours stay
 * dimensionless throughout (no unit conversion, unlike mileage). `smart`
 * reminders target the vehicle's PRIMARY usage dimension (mileage or hours,
 * from getUsageTracking), never both at once.
 */

import { useTranslation } from 'react-i18next'
import { useEffect, useState, type SyntheticEvent } from 'react'
import { Save, AlertTriangle } from 'lucide-react'
import FormModalWrapper from './FormModalWrapper'
import { Button, Field, Input, Textarea } from './ui'
import { toast } from 'sonner'
import { useCreateReminder, useUpdateReminder } from '../hooks/useReminders'
import type { Reminder, ReminderType } from '../types/reminder'
import type { Vehicle } from '../types/vehicle'
import { useUnitPreference } from '../hooks/useUnitPreference'
import { UnitConverter, UnitFormatter } from '../utils/units'
import { toCanonicalKm } from '../utils/decimalSafe'
import { getUsageTracking } from '../utils/usageTracking'
import api from '../services/api'
import { getActionErrorMessage, parseApiError } from '../utils/httpErrorHandler'
import { getActiveLocale } from '@/constants/i18n'

interface ReminderFormProps {
  vin: string
  reminder?: Reminder
  currentMileage?: number | null
  currentHours?: number | null
  onClose: () => void
  onSuccess: () => void
}

/**
 * All reminder-type definitions, keyed by value. `labelKey`/`descriptionKey`
 * are resolved through t() at render time — never store the English here.
 * The component filters/orders these per-vehicle via getUsageTracking (Task
 * 15) — hours-only vehicles never offer mileage/both, distance-only vehicles
 * never offer hours.
 */
const REMINDER_TYPE_DEFS: Record<ReminderType, { labelKey: string; descriptionKey: string }> = {
  date: { labelKey: 'reminderForm.typeDate', descriptionKey: 'reminderForm.typeDateDescription' },
  mileage: { labelKey: 'reminderForm.typeMileage', descriptionKey: 'reminderForm.typeMileageDescription' },
  hours: { labelKey: 'reminderForm.typeHours', descriptionKey: 'reminderForm.typeHoursDescription' },
  both: { labelKey: 'reminderForm.typeBoth', descriptionKey: 'reminderForm.typeBothDescription' },
  smart: { labelKey: 'reminderForm.typeSmart', descriptionKey: 'reminderForm.typeSmartDescription' },
}

export default function ReminderForm({ vin, reminder, currentMileage, currentHours, onClose, onSuccess }: ReminderFormProps) {
  const { t } = useTranslation('forms')
  const isEdit = !!reminder
  const createMutation = useCreateReminder(vin)
  const updateMutation = useUpdateReminder(vin)
  const hasMileage = currentMileage != null && currentMileage > 0
  const hasHours = currentHours != null && currentHours > 0
  const { system } = useUnitPreference()
  // currentMileage is in canonical km. Convert to user display unit when present.
  const currentDisplay = currentMileage != null
    ? (system === 'imperial' ? UnitConverter.kmToMiles(currentMileage) ?? currentMileage : currentMileage)
    : null

  // Task 15 — which usage dimension(s) this vehicle tracks, driving the
  // reminder-type options + due_hours field visibility below. Defaults mirror
  // getUsageTracking's own distance-primary default so the form doesn't
  // flash the wrong options before the vehicle fetch resolves. Independent
  // `/vehicles/{vin}` fetch, mirroring FuelRecordForm/ServiceVisitForm (Tasks
  // 13/14) rather than threading a new prop through ReminderList.
  const [vehicleUsageUnit, setVehicleUsageUnit] = useState<string>('distance')
  const [vehicleSecondaryUsageEnabled, setVehicleSecondaryUsageEnabled] = useState<boolean>(false)
  useEffect(() => {
    const fetchVehicleUsage = async () => {
      try {
        const response = await api.get(`/vehicles/${vin}`)
        const vehicleData: Vehicle = response.data
        setVehicleUsageUnit(vehicleData.usage_unit || 'distance')
        setVehicleSecondaryUsageEnabled(!!vehicleData.secondary_usage_enabled)
      } catch {
        // Silent fail - non-critical for field visibility
      }
    }
    fetchVehicleUsage()
  }, [vin])
  const { tracksDistance, tracksHours, primary } = getUsageTracking({
    usage_unit: vehicleUsageUnit,
    secondary_usage_enabled: vehicleSecondaryUsageEnabled,
  })

  // Type options filtered by which dimension(s) this vehicle tracks: hours-only
  // never offers mileage/both (backend rejects those combos for an hours-only
  // vehicle anyway), distance-only never offers hours, dual offers everything.
  const reminderTypeOrder: ReminderType[] = tracksDistance && tracksHours
    ? ['date', 'mileage', 'hours', 'both', 'smart']
    : tracksHours
      ? ['date', 'hours', 'smart']
      : ['date', 'mileage', 'both', 'smart']
  const reminderTypeOptions = reminderTypeOrder.map((value) => ({ value, ...REMINDER_TYPE_DEFS[value] }))

  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [title, setTitle] = useState(reminder?.title ?? '')
  const [reminderType, setReminderType] = useState<ReminderType>(
    (reminder?.reminder_type as ReminderType) ?? 'date'
  )
  const [dueDate, setDueDate] = useState(reminder?.due_date ?? '')

  // For edits: reverse-compute interval (in user display unit) from absolute
  // canonical km target.
  const initialInterval = (() => {
    const dueKm = reminder?.due_mileage_km
    if (dueKm == null) return undefined
    const dueKmNum = typeof dueKm === 'string' ? parseFloat(dueKm) : dueKm
    if (isNaN(dueKmNum)) return undefined
    const remainingKm = currentMileage != null ? Math.max(0, dueKmNum - currentMileage) : dueKmNum
    if (system === 'imperial') {
      return Math.round(UnitConverter.kmToMiles(remainingKm) ?? remainingKm)
    }
    return Math.round(remainingKm)
  })()
  const [mileageInterval, setMileageInterval] = useState<number | undefined>(initialInterval)

  // Task 15 (revised) — hours input is always an interval ("engine-hours
  // until due"), mirroring the mileage field above exactly. On edit, reverse-
  // compute the remaining interval (in hours — dimensionless, no unit
  // conversion) from the absolute due_hours target.
  const initialHoursInterval = (() => {
    const dh = reminder?.due_hours
    if (dh == null) return undefined
    const dhNum = typeof dh === 'string' ? parseFloat(dh) : dh
    if (isNaN(dhNum)) return undefined
    const remainingHours = currentHours != null ? Math.max(0, dhNum - currentHours) : dhNum
    return Math.round(remainingHours * 10) / 10
  })()
  const [hoursInterval, setHoursInterval] = useState<number | undefined>(initialHoursInterval)

  const [notes, setNotes] = useState(reminder?.notes ?? '')

  // Compute target for display in user's units
  const absoluteTarget = hasMileage && mileageInterval && currentDisplay != null
    ? currentDisplay + mileageInterval
    : mileageInterval

  // Hours target for display — dimensionless, so no display-unit conversion
  // (unlike absoluteTarget above), mirroring the same current+interval math.
  const absoluteHoursTarget = hasHours && hoursInterval && currentHours != null
    ? currentHours + hoursInterval
    : hoursInterval

  // Task 15 — smart reminders target the vehicle's PRIMARY dimension (keeps
  // the backend's exactly-one-of{mileage,hours} rule trivially satisfied: we
  // never populate both). A dual vehicle defaults to distance-primary unless
  // usage_unit === 'hours'.
  const smartUsesHours = reminderType === 'smart' && primary === 'hours'
  const needsMileageField = reminderType === 'mileage' || reminderType === 'both' ||
    (reminderType === 'smart' && !smartUsesHours)
  const needsHoursField = reminderType === 'hours' || smartUsesHours

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    if (!title.trim()) {
      setError(t('reminder.titleRequired'))
      return
    }

    if (['date', 'both', 'smart'].includes(reminderType) && !dueDate) {
      setError(t('reminder.dueDateRequired'))
      return
    }

    if (needsMileageField && !mileageInterval) {
      setError(t('reminder.milesRequired'))
      return
    }

    if (needsHoursField && !hoursInterval) {
      setError(t('reminder.hoursRequired'))
      return
    }

    // Convert user-entered interval (display unit) to canonical km, then add
    // baseline canonical km for absolute target. Never sent for an hours-only
    // or smart-hours reminder — the backend rejects both metrics at once.
    const intervalKm = toCanonicalKm(mileageInterval ?? null, system)
    const due_mileage_km = needsMileageField
      ? (hasMileage && intervalKm != null ? currentMileage + intervalKm : intervalKm ?? undefined)
      : undefined
    // due_hours mirrors due_mileage_km's interval → absolute conversion:
    // currentHours baseline + entered interval when available, else the
    // entered value is the absolute target itself. Dimensionless — no
    // canonical unit conversion — and only sent for the type/metric combos
    // that target it.
    const due_hours = needsHoursField
      ? (hasHours && hoursInterval != null ? currentHours + hoursInterval : hoursInterval ?? undefined)
      : undefined

    setSubmitting(true)
    try {
      if (isEdit && reminder) {
        await updateMutation.mutateAsync({
          id: reminder.id,
          title,
          reminder_type: reminderType,
          due_date: dueDate || undefined,
          due_mileage_km,
          due_hours,
          notes: notes || undefined,
        })
        toast.success(t('reminder.updated'))
      } else {
        await createMutation.mutateAsync({
          title,
          reminder_type: reminderType,
          due_date: dueDate || undefined,
          due_mileage_km,
          due_hours,
          notes: notes || undefined,
        })
        toast.success(t('reminder.created'))
      }
      onSuccess()
    } catch (err) {
      const problems = parseApiError(err).fieldErrors
      if (problems.length > 0) {
        setFieldErrors(Object.fromEntries(problems.map((p) => [p.field, p.message])))
      } else {
        setError(getActionErrorMessage(err, t('reminder.saveAction')))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormModalWrapper
      title={isEdit ? t('reminder.editTitle') : t('reminder.createTitle')}
      onClose={onClose}
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('common:cancel')}
          </Button>
          <Button type="submit" form="reminder-form" icon={Save} loading={submitting} disabled={submitting}>
            {submitting ? t('common:saving') : isEdit ? t('common:update') : t('common:create')}
          </Button>
        </>
      }
    >
      <form id="reminder-form" onSubmit={handleSubmit} className="p-6 space-y-4">
        {error && (
          <div className="bg-danger/10 border border-danger rounded-lg p-3 flex items-center gap-2">
            <AlertTriangle aria-hidden="true" className="w-5 h-5 text-danger" />
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        <Field id="reminder-title" label={t('common:title')} required error={fieldErrors.title}>
          <Input
            id="reminder-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('reminder.titlePlaceholder')}
            maxLength={200}
            disabled={submitting}
          />
        </Field>

        <div>
          <label className="block text-sm font-medium text-text mb-1">
            {t('reminder.reminderType')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {reminderTypeOptions.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setReminderType(type.value)}
                disabled={submitting}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  reminderType === type.value
                    ? 'border-(--accent-line) bg-(--accent-soft) text-(--accent-fg)'
                    : 'border-border bg-surface-2 text-text hover:border-(--accent-line)'
                }`}
              >
                <div className="text-sm font-medium">{t(type.labelKey)}</div>
                <div className="text-xs text-text-mute mt-0.5">{t(type.descriptionKey)}</div>
              </button>
            ))}
          </div>
        </div>

        {['date', 'both', 'smart'].includes(reminderType) && (
          <Field id="reminder-due-date" label={t('reminder.dueDate')} required error={fieldErrors.due_date}>
            <Input
              id="reminder-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={submitting}
            />
          </Field>
        )}

        {needsMileageField && (
          <div>
            <Field
              id="reminder-mileage"
              label={hasMileage ? t('reminder.milesUntilDue') : t('reminder.dueMileage')}
              unit={UnitFormatter.getDistanceUnit(system)}
              required
              error={fieldErrors.due_mileage_km}
            >
              <Input
                id="reminder-mileage"
                type="number"
                value={mileageInterval ?? ''}
                onChange={(e) => setMileageInterval(e.target.value ? parseInt(e.target.value) : undefined)}
                min="1"
                placeholder={
                  hasMileage
                    ? t('reminderForm.mileageIntervalPlaceholder')
                    : system === 'imperial'
                      ? t('reminderForm.mileageAbsolutePlaceholderImperial')
                      : t('reminderForm.mileageAbsolutePlaceholderMetric')
                }
                disabled={submitting}
              />
            </Field>
            {hasMileage && mileageInterval && currentDisplay != null ? (
              <p className="text-xs text-text-mute mt-1">
                {t('reminderForm.mileageTargetHint', {
                  current: Math.round(currentDisplay).toLocaleString(getActiveLocale()),
                  interval: mileageInterval.toLocaleString(getActiveLocale()),
                  target: Math.round(absoluteTarget ?? 0).toLocaleString(getActiveLocale()),
                  unit: UnitFormatter.getDistanceUnit(system),
                })}
              </p>
            ) : !hasMileage ? (
              <p className="text-xs text-warning mt-1">{t('reminder.noOdometerData')}</p>
            ) : null}
            {isEdit && hasMileage && initialInterval !== undefined && initialInterval <= 0 && (
              <p className="text-xs text-danger mt-1">
                {t('reminder.overdueHint')}
              </p>
            )}
          </div>
        )}

        {/* Task 15 (revised) — engine-hours target, interval-based to mirror
            the mileage field above exactly. Dimensionless: no unit conversion,
            but the same current+interval baseline math and edit-time reverse
            computation apply when a currentHours reading exists. */}
        {needsHoursField && (
          <div>
            <Field
              id="reminder-hours"
              label={hasHours ? t('reminder.hoursUntilDue') : t('reminder.dueHours')}
              unit="hr"
              required
              error={fieldErrors.due_hours}
            >
              <Input
                id="reminder-hours"
                type="number"
                value={hoursInterval ?? ''}
                onChange={(e) => setHoursInterval(e.target.value ? parseFloat(e.target.value) : undefined)}
                min="0"
                step="0.1"
                placeholder={
                  hasHours
                    ? t('reminderForm.hoursIntervalPlaceholder')
                    : t('reminderForm.hoursAbsolutePlaceholder')
                }
                disabled={submitting}
              />
            </Field>
            {hasHours && hoursInterval && currentHours != null ? (
              <p className="text-xs text-text-mute mt-1">
                {t('reminderForm.hoursTargetHint', {
                  current: currentHours.toLocaleString(getActiveLocale()),
                  interval: hoursInterval.toLocaleString(getActiveLocale()),
                  target: (absoluteHoursTarget ?? 0).toLocaleString(getActiveLocale()),
                })}
              </p>
            ) : !hasHours ? (
              <p className="text-xs text-warning mt-1">{t('reminder.noHoursData')}</p>
            ) : null}
            {isEdit && hasHours && initialHoursInterval !== undefined && initialHoursInterval <= 0 && (
              <p className="text-xs text-danger mt-1">
                {t('reminder.overdueHoursHint')}
              </p>
            )}
          </div>
        )}

        {reminderType === 'smart' && (
          <div className="bg-(--accent-soft) border border-(--accent-line) rounded-lg p-3">
            <p className="text-xs text-text-mute">
              {t('reminder.smartModeDescription')}
            </p>
          </div>
        )}

        <Field id="reminder-notes" label={t('common:notes')} error={fieldErrors.notes}>
          <Textarea
            id="reminder-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('reminder.optionalNotes')}
            rows={2}
            disabled={submitting}
          />
        </Field>
      </form>
    </FormModalWrapper>
  )
}
