import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save, FileUp } from 'lucide-react'
import FormModalWrapper from './FormModalWrapper'
import { Button, Field, Input, Select, Textarea } from './ui'
import { toast } from 'sonner'
import type { InsurancePolicy, InsurancePolicyCreate, InsurancePolicyUpdate } from '../types/insurance'
import { insuranceSchema, type InsuranceFormData, POLICY_TYPES, PREMIUM_FREQUENCIES } from '../schemas/insurance'
import InsurancePDFUpload from './InsurancePDFUpload'
import { useCreateInsuranceRecord, useUpdateInsuranceRecord } from '../hooks/queries/useInsuranceRecords'
import { formatDateForInput } from '../utils/dateUtils'

interface InsuranceFormProps {
  vin: string
  record?: InsurancePolicy
  onClose: () => void
  onSuccess: () => void
}

export default function InsuranceForm({ vin, record, onClose, onSuccess }: InsuranceFormProps) {
  const { t } = useTranslation('forms')
  const isEdit = !!record
  const createMutation = useCreateInsuranceRecord(vin)
  const updateMutation = useUpdateInsuranceRecord(vin)
  const [showPDFUpload, setShowPDFUpload] = useState(false)
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set())

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<InsuranceFormData>({
    resolver: zodResolver(insuranceSchema),
    defaultValues: {
      provider: record?.provider || '',
      policy_number: record?.policy_number || '',
      policy_type: record?.policy_type || '',
      start_date: formatDateForInput(record?.start_date),
      end_date: formatDateForInput(record?.end_date === '' || record?.end_date === null ? undefined : record?.end_date),
      premium_amount: record?.premium_amount ?? undefined,
      premium_frequency: record?.premium_frequency ?? undefined,
      deductible: record?.deductible ?? undefined,
      coverage_limits: record?.coverage_limits ?? undefined,
      notes: record?.notes ?? undefined,
    },
  })

  const handlePDFDataExtracted = (extractedData: Partial<InsurancePolicyCreate>) => {
    // Track which fields were auto-filled
    const filledFields = new Set<string>()
    Object.keys(extractedData).forEach(key => {
      if (extractedData[key as keyof typeof extractedData]) {
        filledFields.add(key)
      }
    })
    setAutoFilledFields(filledFields)

    // Update form data using setValue for each extracted field
    if (extractedData.provider) setValue('provider', extractedData.provider)
    if (extractedData.policy_number) setValue('policy_number', extractedData.policy_number)
    if (extractedData.policy_type) setValue('policy_type', extractedData.policy_type)
    if (extractedData.start_date) setValue('start_date', extractedData.start_date)
    if (extractedData.end_date) setValue('end_date', extractedData.end_date)
    if (extractedData.premium_amount) setValue('premium_amount', String(extractedData.premium_amount))
    if (extractedData.premium_frequency) setValue('premium_frequency', extractedData.premium_frequency)
    if (extractedData.deductible) setValue('deductible', String(extractedData.deductible))
    if (extractedData.coverage_limits) setValue('coverage_limits', extractedData.coverage_limits)
    if (extractedData.notes) setValue('notes', extractedData.notes)
  }

  const onSubmit = async (data: InsuranceFormData) => {
    try {
      const payload: InsurancePolicyCreate | InsurancePolicyUpdate = {
        provider: data.provider,
        policy_number: data.policy_number,
        policy_type: data.policy_type,
        start_date: data.start_date,
        end_date: data.end_date,
        premium_amount: data.premium_amount,
        premium_frequency: data.premium_frequency,
        deductible: data.deductible,
        coverage_limits: data.coverage_limits,
        notes: data.notes,
      }

      if (isEdit) {
        await updateMutation.mutateAsync({ id: record.id, ...payload })
      } else {
        await createMutation.mutateAsync(payload as InsurancePolicyCreate)
      }

      onSuccess()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('insurance.failedToSave'))
    }
  }

  return (
    <>
    <FormModalWrapper
      title={isEdit ? t('insurance.editTitle') : t('insurance.createTitle')}
      onClose={onClose}
      width="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('common:cancel')}
          </Button>
          <Button type="submit" form="insurance-form" variant="primary" icon={Save} loading={isSubmitting} disabled={isSubmitting}>
            {isSubmitting ? t('common:saving') : isEdit ? t('common:update') : t('common:create')}
          </Button>
        </>
      }
    >
        <form id="insurance-form" onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">

          {!isEdit && (
            <div className="mb-4">
              <Button type="button" variant="secondary" icon={FileUp} onClick={() => setShowPDFUpload(true)} className="w-full">
                {t('insuranceForm.importFromPdf')}
              </Button>
              <p className="text-xs text-text-mute mt-2 text-center">{t('insurance.pdfUploadHint')}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field id="provider" label={t('insurance.provider')} required error={errors.provider}>
              <Input
                id="provider"
                type="text"
                {...register('provider')}
                placeholder={t('insuranceForm.providerPlaceholder')}
                invalid={!!errors.provider}
                disabled={isSubmitting}
                className={autoFilledFields.has('provider') ? 'ring-2 ring-info/50' : ''}
              />
            </Field>
            <Field id="policy_number" label={t('insurance.policyNumber')} required error={errors.policy_number}>
              <Input id="policy_number" type="text" {...register('policy_number')} placeholder={t('insuranceForm.policyNumberPlaceholder')} invalid={!!errors.policy_number} disabled={isSubmitting} />
            </Field>
          </div>

          <Field id="policy_type" label={t('insurance.policyType')} required error={errors.policy_type}>
            <Select
              id="policy_type"
              {...register('policy_type')}
              disabled={isSubmitting}
              invalid={!!errors.policy_type}
              placeholder={t('common:selectType')}
              options={POLICY_TYPES.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field id="start_date" label={t('common:startDate')} required error={errors.start_date}>
              <Input id="start_date" type="date" {...register('start_date')} invalid={!!errors.start_date} disabled={isSubmitting} />
            </Field>
            <Field id="end_date" label={t('common:endDate')} required error={errors.end_date}>
              <Input id="end_date" type="date" {...register('end_date')} invalid={!!errors.end_date} disabled={isSubmitting} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field id="premium_amount" label={t('insurance.premiumAmount')} error={errors.premium_amount}>
              <Input id="premium_amount" type="text" {...register('premium_amount')} placeholder={t('insuranceForm.premiumAmountPlaceholder')} disabled={isSubmitting} />
            </Field>
            <Field id="premium_frequency" label={t('insurance.premiumFrequency')} error={errors.premium_frequency}>
              <Select
                id="premium_frequency"
                {...register('premium_frequency')}
                disabled={isSubmitting}
                placeholder={t('insurance.selectFrequency')}
                options={PREMIUM_FREQUENCIES.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
              />
            </Field>
          </div>

          <Field id="deductible" label={t('insurance.deductible')} error={errors.deductible}>
            <Input id="deductible" type="text" {...register('deductible')} placeholder={t('insuranceForm.deductiblePlaceholder')} disabled={isSubmitting} />
          </Field>

          <Field id="coverage_limits" label={t('insurance.coverageLimits')}>
            <Textarea id="coverage_limits" rows={3} {...register('coverage_limits')} placeholder={t('insuranceForm.coverageLimitsPlaceholder')} disabled={isSubmitting} />
          </Field>

          <Field id="notes" label={t('common:notes')}>
            <Textarea id="notes" rows={2} {...register('notes')} placeholder={t('common:additionalNotes')} disabled={isSubmitting} />
          </Field>
        </form>
    </FormModalWrapper>

      {/* PDF Upload Modal */}
      {showPDFUpload && (
        <InsurancePDFUpload
          vin={vin}
          onDataExtracted={handlePDFDataExtracted}
          onClose={() => setShowPDFUpload(false)}
        />
      )}
    </>
  )
}
