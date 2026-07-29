import { useTranslation } from 'react-i18next'
import { useCallback } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save } from 'lucide-react'
import FormModalWrapper from './FormModalWrapper'
import { Button, Field, Input, Select, Textarea } from './ui'
import type { WarrantyRecord, WarrantyRecordCreate, WarrantyRecordUpdate } from '../types/warranty'
import { warrantySchema, type WarrantyFormData, WARRANTY_TYPES } from '../schemas/warranty'
import { useCreateWarrantyRecord, useUpdateWarrantyRecord } from '../hooks/queries/useWarrantyRecords'
import { formatDateForInput } from '../utils/dateUtils'
import { useFormSubmit } from '../hooks/useFormSubmit'
import { useUnitPreference } from '../hooks/useUnitPreference'
import { UnitConverter, UnitFormatter } from '../utils/units'
import { toCanonicalKm } from '../utils/decimalSafe'

interface WarrantyFormProps {
  vin: string
  record?: WarrantyRecord
  onClose: () => void
  onSuccess: () => void
}

export default function WarrantyForm({ vin, record, onClose, onSuccess }: WarrantyFormProps) {
  const { t } = useTranslation('forms')
  const isEdit = !!record
  const createMutation = useCreateWarrantyRecord(vin)
  const updateMutation = useUpdateWarrantyRecord(vin)
  const { system } = useUnitPreference()

  const submitFn = useCallback(async (data: WarrantyFormData) => {
    // Convert user-entered mileage limit to canonical km.
    const payload: WarrantyRecordCreate | WarrantyRecordUpdate = {
      warranty_type: data.warranty_type,
      provider: data.provider,
      start_date: data.start_date,
      end_date: data.end_date,
      mileage_limit_km: toCanonicalKm(data.mileage_limit_km, system) ?? undefined,
      coverage_details: data.coverage_details,
      policy_number: data.policy_number,
      notes: data.notes,
    }

    if (isEdit) {
      await updateMutation.mutateAsync({ id: record.id, ...payload })
    } else {
      await createMutation.mutateAsync(payload as WarrantyRecordCreate)
    }
  }, [isEdit, record, system, createMutation, updateMutation])

  const { error, handleSubmit: onSubmit } = useFormSubmit(submitFn, { onSuccess, onClose })

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WarrantyFormData>({
    resolver: zodResolver(warrantySchema) as Resolver<WarrantyFormData>,
    defaultValues: {
      warranty_type: record?.warranty_type || '',
      provider: record?.provider || '',
      start_date: formatDateForInput(record?.start_date),
      end_date: formatDateForInput(record?.end_date === '' || record?.end_date === null ? undefined : record?.end_date),
      mileage_limit_km: (() => {
        const lim = record?.mileage_limit_km
        if (lim == null) return undefined
        const num = typeof lim === 'string' ? parseFloat(lim) : lim
        if (isNaN(num)) return undefined
        return system === 'imperial'
          ? Math.round(UnitConverter.kmToMiles(num) ?? num)
          : Math.round(num)
      })(),
      coverage_details: record?.coverage_details || '',
      policy_number: record?.policy_number || '',
      notes: record?.notes || '',
    },
  })

  return (
    <FormModalWrapper
      title={isEdit ? t('warranty.editTitle') : t('warranty.createTitle')}
      onClose={onClose}
      width="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('common:cancel')}
          </Button>
          <Button type="submit" form="warranty-form" variant="primary" icon={Save} loading={isSubmitting} disabled={isSubmitting}>
            {isSubmitting ? t('common:saving') : isEdit ? t('common:update') : t('common:create')}
          </Button>
        </>
      }
    >
        <form id="warranty-form" onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {error && (
            <div className="bg-danger/10 border border-danger rounded-lg p-3">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field id="warranty_type" label={t('warranty.warrantyType')} required error={errors.warranty_type}>
              <Select
                id="warranty_type"
                {...register('warranty_type')}
                disabled={isSubmitting}
                invalid={!!errors.warranty_type}
                placeholder={t('common:selectType')}
                options={WARRANTY_TYPES.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
              />
            </Field>

            <Field id="provider" label={t('insurance.provider')} error={errors.provider}>
              <Input id="provider" type="text" {...register('provider')} placeholder={t('warrantyForm.providerPlaceholder')} invalid={!!errors.provider} disabled={isSubmitting} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field id="start_date" label={t('common:startDate')} required error={errors.start_date}>
              <Input id="start_date" type="date" {...register('start_date')} invalid={!!errors.start_date} disabled={isSubmitting} />
            </Field>
            <Field id="end_date" label={t('common:endDate')} error={errors.end_date}>
              <Input id="end_date" type="date" {...register('end_date')} invalid={!!errors.end_date} disabled={isSubmitting} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field id="mileage_limit_km" label={t('warranty.mileageLimit')} unit={UnitFormatter.getDistanceUnit(system)} error={errors.mileage_limit_km}>
              <Input id="mileage_limit_km" type="number" mono {...register('mileage_limit_km', { valueAsNumber: true })} min="0" placeholder={t('warrantyForm.mileageLimitPlaceholder')} invalid={!!errors.mileage_limit_km} disabled={isSubmitting} />
            </Field>
            <Field id="policy_number" label={t('insurance.policyNumber')} error={errors.policy_number}>
              <Input id="policy_number" type="text" {...register('policy_number')} placeholder={t('warrantyForm.policyNumberPlaceholder')} invalid={!!errors.policy_number} disabled={isSubmitting} />
            </Field>
          </div>

          <Field id="coverage_details" label={t('warranty.coverageDetails')} error={errors.coverage_details}>
            <Textarea id="coverage_details" rows={3} {...register('coverage_details')} placeholder={t('warranty.coverageDetailsPlaceholder')} invalid={!!errors.coverage_details} disabled={isSubmitting} />
          </Field>

          <Field id="notes" label={t('common:notes')} error={errors.notes}>
            <Textarea id="notes" rows={2} {...register('notes')} placeholder={t('common:additionalNotes')} invalid={!!errors.notes} disabled={isSubmitting} />
          </Field>
        </form>
    </FormModalWrapper>
  )
}
