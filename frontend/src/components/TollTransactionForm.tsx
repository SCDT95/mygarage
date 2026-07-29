import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save } from 'lucide-react'
import FormModalWrapper from './FormModalWrapper'
import CurrencyInputPrefix from './common/CurrencyInputPrefix'
import { Button, Field, Input, Select, Textarea } from './ui'
import type { TollTransaction, TollTransactionCreate, TollTransactionUpdate, TollTag } from '../types/toll'
import { tollTransactionSchema, type TollTransactionFormData } from '../schemas/tollTransaction'
import { useCreateTollTransaction, useUpdateTollTransaction } from '../hooks/queries/useTollRecords'

interface TollTransactionFormProps {
  vin: string
  tollTags: TollTag[]
  transaction?: TollTransaction
  onClose: () => void
  onSuccess: () => void
}

export default function TollTransactionForm({ vin, tollTags, transaction, onClose, onSuccess }: TollTransactionFormProps) {
  const { t } = useTranslation('forms')
  const isEdit = !!transaction
  const [error, setError] = useState<string | null>(null)
  const createMutation = useCreateTollTransaction(vin)
  const updateMutation = useUpdateTollTransaction(vin)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TollTransactionFormData>({
    resolver: zodResolver(tollTransactionSchema) as Resolver<TollTransactionFormData>,
    defaultValues: {
      transaction_date: transaction?.date || new Date().toISOString().split('T')[0],
      amount: transaction?.amount != null ? Number(transaction.amount) : undefined,
      location: transaction?.location || '',
      toll_tag_id: transaction?.toll_tag_id ?? undefined,
      notes: transaction?.notes || '',
    },
  })

  const onSubmit = async (data: TollTransactionFormData) => {
    setError(null)

    try {
      // Zod has already validated and coerced amount and toll_tag_id - no parseFloat/parseInt needed!
      const payload: TollTransactionCreate | TollTransactionUpdate = {
        transaction_date: data.transaction_date,
        amount: data.amount,
        location: data.location,
        toll_tag_id: data.toll_tag_id,
        notes: data.notes,
      }

      if (!isEdit) {
        (payload as TollTransactionCreate).vin = vin
      }

      if (isEdit) {
        await updateMutation.mutateAsync({ id: transaction.id, ...payload })
      } else {
        await createMutation.mutateAsync(payload as TollTransactionCreate)
      }

      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common:error'))
    }
  }

  const activeTollTags = tollTags.filter(tag => tag.status === 'active')

  return (
    <FormModalWrapper
      title={isEdit ? t('toll.editTransactionTitle') : t('toll.createTransactionTitle')}
      onClose={onClose}
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('tollTransactionForm.cancel')}
          </Button>
          <Button type="submit" form="toll-transaction-form" variant="primary" icon={Save} loading={isSubmitting} disabled={isSubmitting}>
            {isSubmitting ? t('common:saving') : isEdit ? t('toll.updateTransaction') : t('toll.addTransaction')}
          </Button>
        </>
      }
    >
        <form id="toll-transaction-form" onSubmit={handleSubmit(onSubmit as Parameters<typeof handleSubmit>[0])} className="p-6 space-y-4">
          {error && (
            <div className="bg-danger/10 border border-danger rounded-lg p-3">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field id="transaction_date" label={t('common:date')} required error={errors.transaction_date}>
              <Input id="transaction_date" type="date" {...register('transaction_date')} invalid={!!errors.transaction_date} disabled={isSubmitting} />
            </Field>

            <Field id="amount" label={t('common:amount')} required error={errors.amount}>
              <div className="relative">
                <CurrencyInputPrefix />
                <input
                  type="number"
                  id="amount"
                  min="0"
                  step="0.01"
                  {...register('amount', { valueAsNumber: true })}
                  placeholder="0.00"
                  aria-invalid={errors.amount ? true : undefined}
                  className={`ui-focus-input ui-motion w-full rounded-control border bg-surface-2 pl-7 pr-3 py-2 text-sm text-text font-mono tabular-nums ${errors.amount ? 'border-danger' : 'border-border'}`}
                  disabled={isSubmitting}
                />
              </div>
            </Field>
          </div>

          <Field id="location" label={t('toll.location')} required error={errors.location}>
            <Input id="location" type="text" {...register('location')} placeholder={t('toll.locationPlaceholder')} invalid={!!errors.location} disabled={isSubmitting} />
          </Field>

          <Field id="toll_tag_id" label={t('toll.tollTag')} error={errors.toll_tag_id}>
            <Select
              id="toll_tag_id"
              {...register('toll_tag_id', { valueAsNumber: true })}
              disabled={isSubmitting}
              invalid={!!errors.toll_tag_id}
              placeholder={t('toll.noneManualPayment')}
              options={activeTollTags.map((tag) => ({ value: String(tag.id), label: `${tag.toll_system} - ${tag.tag_number}` }))}
            />
            {activeTollTags.length === 0 && (
              <p className="text-xs text-text-mute mt-1">{t('toll.noActiveTollTags')}</p>
            )}
          </Field>

          <Field id="notes" label={t('common:notes')} error={errors.notes}>
            <Textarea id="notes" rows={3} {...register('notes')} placeholder={t('toll.transactionNotesPlaceholder')} invalid={!!errors.notes} disabled={isSubmitting} />
          </Field>
        </form>
    </FormModalWrapper>
  )
}
