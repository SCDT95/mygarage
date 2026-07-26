import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save } from 'lucide-react'
import FormModalWrapper from './FormModalWrapper'
import { Button, Field, Input, Textarea } from './ui'
import CurrencyInputPrefix from './common/CurrencyInputPrefix'
import type {
  SpotRentalBilling,
  SpotRentalBillingCreate,
  SpotRentalBillingUpdate
} from '../types/spotRental'
import {
  spotRentalBillingSchema,
  type SpotRentalBillingFormData
} from '../schemas/spotRentalBilling'
import { useCreateBillingEntry, useUpdateBillingEntry } from '../hooks/queries/useSpotRentals'
import { formatDateForInput } from '../utils/dateUtils'

interface BillingEntryFormProps {
  vin: string
  rentalId: number
  billing?: SpotRentalBilling
  onClose: () => void
  onSuccess: () => void
}

export default function BillingEntryForm({
  vin,
  rentalId,
  billing,
  onClose,
  onSuccess
}: BillingEntryFormProps) {
  const { t } = useTranslation('forms')
  const isEdit = !!billing
  const [error, setError] = useState<string | null>(null)
  const createMutation = useCreateBillingEntry(vin, rentalId)
  const updateMutation = useUpdateBillingEntry(vin, rentalId)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<SpotRentalBillingFormData>({
    resolver: zodResolver(spotRentalBillingSchema) as Resolver<SpotRentalBillingFormData>,
    defaultValues: {
      billing_date: formatDateForInput(billing?.billing_date),
      monthly_rate: billing?.monthly_rate != null ? Number(billing.monthly_rate) : undefined,
      electric: billing?.electric != null ? Number(billing.electric) : undefined,
      water: billing?.water != null ? Number(billing.water) : undefined,
      waste: billing?.waste != null ? Number(billing.waste) : undefined,
      total: billing?.total != null ? Number(billing.total) : undefined,
      notes: billing?.notes ?? undefined
    }
  })

  // Auto-calculate total from monthly_rate + electric + water + waste
  const monthlyRate = watch('monthly_rate')
  const electric = watch('electric')
  const water = watch('water')
  const waste = watch('waste')

  useEffect(() => {
    const monthly = monthlyRate || 0
    const elec = electric || 0
    const wat = water || 0
    const wst = waste || 0
    const calculatedTotal = monthly + elec + wat + wst

    // Only set if there's a meaningful value
    if (calculatedTotal > 0) {
      setValue('total', calculatedTotal)
    }
  }, [monthlyRate, electric, water, waste, setValue])

  const onSubmit = async (data: SpotRentalBillingFormData) => {
    try {
      setError(null)

      const payload: SpotRentalBillingCreate | SpotRentalBillingUpdate = {
        billing_date: data.billing_date,
        monthly_rate: data.monthly_rate ?? null,
        electric: data.electric ?? null,
        water: data.water ?? null,
        waste: data.waste ?? null,
        total: data.total ?? null,
        notes: data.notes ?? null
      }

      if (isEdit && billing) {
        await updateMutation.mutateAsync({ id: billing.id, ...payload })
      } else {
        await createMutation.mutateAsync(payload as SpotRentalBillingCreate)
      }

      onSuccess()
      onClose()
    } catch (err: unknown) {
      console.error('Failed to save billing entry:', err)
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosError = err as {
          response?: { data?: { detail?: string }; status?: number }
        }
        if (axiosError.response?.data?.detail) {
          setError(axiosError.response.data.detail)
        } else if (axiosError.response?.status === 404) {
          setError(t('billing.spotRentalNotFound'))
        } else {
          setError(t('billing.failedToSave'))
        }
      } else {
        setError(t('billing.failedToSave'))
      }
    }
  }

  return (
    <FormModalWrapper
      title={isEdit ? t('billing.editTitle') : t('billing.createTitle')}
      onClose={onClose}
      width="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('common:cancel')}
          </Button>
          <Button type="submit" form="billing-entry-form" variant="primary" icon={Save} loading={isSubmitting} disabled={isSubmitting}>
            {isSubmitting ? t('common:saving') : isEdit ? t('common:update') : t('common:create')}
          </Button>
        </>
      }
    >
        <form id="billing-entry-form" onSubmit={handleSubmit(onSubmit as Parameters<typeof handleSubmit>[0])} className="p-6 space-y-6">
          {error && (
            <div className="bg-danger/10 border border-danger rounded-lg p-3">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          <Field id="billing_date" label={t('billing.billingDate')} required error={errors.billing_date}>
            <Input id="billing_date" type="date" {...register('billing_date')} invalid={!!errors.billing_date} disabled={isSubmitting} />
          </Field>

          <Field id="monthly_rate" label={t('spotRental.monthlyRate')} error={errors.monthly_rate}>
            <div className="relative">
              <CurrencyInputPrefix />
              <input
                type="number"
                id="monthly_rate"
                min="0"
                step="0.01"
                {...register('monthly_rate', { valueAsNumber: true })}
                placeholder="0.00"
                className={`ui-focus-input ui-motion w-full rounded-control border bg-surface-2 pl-7 pr-3 py-2 text-sm text-text font-mono tabular-nums ${errors.monthly_rate ? 'border-danger' : 'border-border'}`}
                disabled={isSubmitting}
              />
            </div>
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field id="electric" label={t('billingEntryForm.electric')} error={errors.electric}>
              <div className="relative">
                <CurrencyInputPrefix />
                <input
                  type="number"
                  id="electric"
                  min="0"
                  step="0.01"
                  {...register('electric', { valueAsNumber: true })}
                  placeholder="0.00"
                  className={`ui-focus-input ui-motion w-full rounded-control border bg-surface-2 pl-7 pr-3 py-2 text-sm text-text font-mono tabular-nums ${errors.electric ? 'border-danger' : 'border-border'}`}
                  disabled={isSubmitting}
                />
              </div>
            </Field>

            <Field id="water" label={t('billingEntryForm.water')} error={errors.water}>
              <div className="relative">
                <CurrencyInputPrefix />
                <input
                  type="number"
                  id="water"
                  min="0"
                  step="0.01"
                  {...register('water', { valueAsNumber: true })}
                  placeholder="0.00"
                  className={`ui-focus-input ui-motion w-full rounded-control border bg-surface-2 pl-7 pr-3 py-2 text-sm text-text font-mono tabular-nums ${errors.water ? 'border-danger' : 'border-border'}`}
                  disabled={isSubmitting}
                />
              </div>
            </Field>

            <Field id="waste" label={t('billingEntryForm.waste')} error={errors.waste}>
              <div className="relative">
                <CurrencyInputPrefix />
                <input
                  type="number"
                  id="waste"
                  min="0"
                  step="0.01"
                  {...register('waste', { valueAsNumber: true })}
                  placeholder="0.00"
                  className={`ui-focus-input ui-motion w-full rounded-control border bg-surface-2 pl-7 pr-3 py-2 text-sm text-text font-mono tabular-nums ${errors.waste ? 'border-danger' : 'border-border'}`}
                  disabled={isSubmitting}
                />
              </div>
            </Field>
          </div>

          <Field id="total" label={t('common:total')} hint={t('billing.autoCalculatedHint')} error={errors.total}>
            <div className="relative">
              <CurrencyInputPrefix />
              <input
                type="number"
                id="total"
                min="0"
                step="0.01"
                {...register('total', { valueAsNumber: true })}
                placeholder={t('billingEntryForm.autoCalculatedPlaceholder')}
                className="ui-focus-input ui-motion w-full rounded-control border border-border bg-surface-2 pl-7 pr-3 py-2 text-sm text-text font-mono tabular-nums"
                readOnly
              />
            </div>
          </Field>

          <Field id="notes" label={t('common:notes')} error={errors.notes}>
            <Textarea
              id="notes"
              rows={4}
              {...register('notes')}
              placeholder={t('billing.notesPlaceholder')}
              invalid={!!errors.notes}
              disabled={isSubmitting}
            />
          </Field>
        </form>
    </FormModalWrapper>
  )
}
