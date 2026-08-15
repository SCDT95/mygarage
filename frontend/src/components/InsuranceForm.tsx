import { useTranslation } from 'react-i18next'
import { useMemo, useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save, FileUp } from 'lucide-react'
import FormModalWrapper from './FormModalWrapper'
import { Button, Field, Input, NumberInput, Select, Textarea, registerDecimal } from './ui'
import { toast } from 'sonner'
import type { InsurancePolicy, InsurancePolicyCreate, InsurancePolicyUpdate } from '../types/insurance'
import {
  makeInsuranceSchema,
  type InsuranceFormData,
  POLICY_TYPES,
  PREMIUM_FREQUENCIES,
} from '../schemas/insurance'
import InsurancePDFUpload from './InsurancePDFUpload'
import { useCreateInsuranceRecord, useUpdateInsuranceRecord } from '../hooks/queries/useInsuranceRecords'
import { formatDateForInput } from '../utils/dateUtils'
import { applyServerErrors } from '../hooks/useApiFormErrors'
import { getActionErrorMessage } from '../utils/httpErrorHandler'

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

  // Zod bakes its messages in at construction, so the schema is rebuilt when
  // the language changes. Only the resolver depends on it — no fetch, no
  // reset() — so a rebuild can't discard what the user typed.
  const schema = useMemo(() => makeInsuranceSchema(t), [t])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    setError: setFieldError,
  } = useForm<InsuranceFormData>({
    resolver: zodResolver(schema) as Resolver<InsuranceFormData>,
    defaultValues: {
      provider: record?.provider || '',
      policy_number: record?.policy_number || '',
      policy_type: record?.policy_type || '',
      start_date: formatDateForInput(record?.start_date),
      end_date: formatDateForInput(record?.end_date === '' || record?.end_date === null ? undefined : record?.end_date),
      // The API returns these as strings (or numbers); the schema now wants numbers.
      premium_amount: record?.premium_amount != null ? Number(record.premium_amount) : undefined,
      premium_frequency: record?.premium_frequency ?? undefined,
      deductible: record?.deductible != null ? Number(record.deductible) : undefined,
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
    if (extractedData.premium_amount) setValue('premium_amount', Number(extractedData.premium_amount))
    if (extractedData.premium_frequency) setValue('premium_frequency', extractedData.premium_frequency)
    if (extractedData.deductible) setValue('deductible', Number(extractedData.deductible))
    if (extractedData.coverage_limits) setValue('coverage_limits', extractedData.coverage_limits)
    if (extractedData.notes) setValue('notes', extractedData.notes)
  }

  const onSubmit = async (data: InsuranceFormData) => {
    try {
      // Send null, never '', for a cleared optional field — every field on
      // this form is mounted, so an explicit null correctly clears the
      // column. The old code forwarded the raw '' from an untouched
      // deductible straight to a backend `Decimal | None` column, which is
      // half of #140 (the other half was the unparsed comma decimal).
      const payload: InsurancePolicyCreate | InsurancePolicyUpdate = {
        provider: data.provider,
        policy_number: data.policy_number,
        policy_type: data.policy_type,
        start_date: data.start_date,
        end_date: data.end_date,
        premium_amount: data.premium_amount ?? null,
        premium_frequency: data.premium_frequency || null,
        deductible: data.deductible ?? null,
        coverage_limits: data.coverage_limits || null,
        notes: data.notes || null,
      }

      if (isEdit) {
        await updateMutation.mutateAsync({ id: record.id, ...payload })
      } else {
        await createMutation.mutateAsync(payload as InsurancePolicyCreate)
      }

      onSuccess()
      onClose()
    } catch (err) {
      const { unhandled } = applyServerErrors<InsuranceFormData>(setFieldError, err, [
        'provider',
        'policy_number',
        'policy_type',
        'start_date',
        'end_date',
        'premium_amount',
        'premium_frequency',
        'deductible',
        'coverage_limits',
        'notes',
      ])
      if (unhandled.length > 0) toast.error(getActionErrorMessage(err, t('insurance.saveAction')))
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
              <NumberInput
                id="premium_amount"
                {...registerDecimal(register, 'premium_amount')}
                placeholder={t('insuranceForm.premiumAmountPlaceholder')}
                invalid={!!errors.premium_amount}
                disabled={isSubmitting}
              />
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
            <NumberInput
              id="deductible"
              {...registerDecimal(register, 'deductible')}
              placeholder={t('insuranceForm.deductiblePlaceholder')}
              invalid={!!errors.deductible}
              disabled={isSubmitting}
            />
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
