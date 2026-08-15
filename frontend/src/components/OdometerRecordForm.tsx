import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save } from 'lucide-react'
import FormModalWrapper from './FormModalWrapper'
import type { OdometerRecord, OdometerRecordCreate, OdometerRecordUpdate } from '../types/odometer'
import { makeOdometerRecordSchema, type OdometerRecordFormData } from '../schemas/odometer'
import { useCreateOdometerRecord, useUpdateOdometerRecord } from '../hooks/queries/useOdometerRecords'
import { useUnitPreference } from '../hooks/useUnitPreference'
import { UnitConverter, UnitFormatter } from '../utils/units'
import { toCanonicalKm } from '../utils/decimalSafe'
import { formatDateForInput } from '../utils/dateUtils'
import { useFormSubmit } from '../hooks/useFormSubmit'
import { Button, Field, Input, NumberInput, Textarea, registerDecimal } from './ui'

interface OdometerRecordFormProps {
  vin: string
  record?: OdometerRecord
  onClose: () => void
  onSuccess: () => void
}

export default function OdometerRecordForm({ vin, record, onClose, onSuccess }: OdometerRecordFormProps) {
  const { t } = useTranslation('forms')
  const isEdit = !!record
  const createMutation = useCreateOdometerRecord(vin)
  const updateMutation = useUpdateOdometerRecord(vin)
  const { system } = useUnitPreference()

  const submitFn = useCallback(async (data: OdometerRecordFormData) => {
    // Convert user-entered value to canonical km for the API.
    const payload: OdometerRecordCreate | OdometerRecordUpdate = {
      vin,
      date: data.date,
      odometer_km: toCanonicalKm(data.odometer_km, system) ?? undefined,
      notes: data.notes,
    }

    if (isEdit) {
      await updateMutation.mutateAsync({ id: record.id, ...payload })
    } else {
      await createMutation.mutateAsync(payload as OdometerRecordCreate)
    }
  }, [isEdit, vin, record, system, createMutation, updateMutation])

  const { error, handleSubmit: onSubmit } = useFormSubmit(submitFn, {
    onSuccess,
    onClose,
    action: t('odometer.saveAction'),
  })

  // Zod bakes its messages in at construction, so the schema is rebuilt when
  // the language changes. Only the resolver depends on it — no fetch, no
  // reset() — so a rebuild can't discard what the user typed.
  const schema = useMemo(() => makeOdometerRecordSchema(t), [t])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OdometerRecordFormData>({
    resolver: zodResolver(schema) as Resolver<OdometerRecordFormData>,
    defaultValues: {
      date: formatDateForInput(record?.date),
      odometer_km: (() => {
        const stored = record?.odometer_km
        const num = stored == null ? undefined : (typeof stored === 'string' ? parseFloat(stored) : stored)
        if (num == null || isNaN(num)) return undefined
        return system === 'imperial' ? UnitConverter.kmToMiles(num) ?? undefined : num
      })(),
      notes: record?.notes || '',
    },
  })

  return (
    <FormModalWrapper
      title={isEdit ? t('odometer.editTitle') : t('odometer.createTitle')}
      onClose={onClose}
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>{t('odometerRecordForm.cancel')}</Button>
          <Button type="submit" form="odometer-record-form" variant="primary" icon={Save} loading={isSubmitting} disabled={isSubmitting}>
            {isSubmitting ? t('common:saving') : isEdit ? t('common:update') : t('common:create')}
          </Button>
        </>
      }
    >
        <form id="odometer-record-form" onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {error && (
            <div className="bg-danger/10 border border-danger rounded-lg p-3">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          <Field id="date" label={t('common:date')} required error={errors.date}>
            <Input id="date" type="date" {...register('date')} invalid={!!errors.date} disabled={isSubmitting} />
          </Field>

          <Field id="odometer_km" label={t('common:mileage')} unit={UnitFormatter.getDistanceUnit(system)} required error={errors.odometer_km}>
            <NumberInput
              id="odometer_km"
              {...registerDecimal(register, 'odometer_km')}
              placeholder={system === 'imperial' ? '45000' : '72420'}
              invalid={!!errors.odometer_km}
              disabled={isSubmitting}
            />
          </Field>

          <Field id="notes" label={t('odometerRecordForm.notes')} error={errors.notes}>
            <Textarea id="notes" rows={3} {...register('notes')} placeholder={t('odometer.notesPlaceholder')} invalid={!!errors.notes} disabled={isSubmitting} />
          </Field>
        </form>
    </FormModalWrapper>
  )
}
