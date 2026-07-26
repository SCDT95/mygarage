import { useTranslation } from 'react-i18next'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save } from 'lucide-react'
import FormModalWrapper from './FormModalWrapper'
import { Button, Field, Input, Textarea } from './ui'
import type { TollTag, TollTagCreate, TollTagUpdate } from '../types/toll'
import {
  makeTollTagSchema,
  type TollTagFormData,
  type TollSystemValue,
  TOLL_SYSTEM_OPTIONS,
} from '../schemas/tollTag'
import { useCreateTollTag, useUpdateTollTag } from '../hooks/queries/useTollRecords'

interface TollTagFormProps {
  vin: string
  tag?: TollTag
  onClose: () => void
  onSuccess: () => void
}

export default function TollTagForm({ vin, tag, onClose, onSuccess }: TollTagFormProps) {
  const { t } = useTranslation('forms')
  const isEdit = !!tag
  const [error, setError] = useState<string | null>(null)
  const createMutation = useCreateTollTag(vin)
  const updateMutation = useUpdateTollTag(vin)

  // Zod bakes its messages in at construction, so the schema is rebuilt when
  // the language changes. Only the resolver depends on it — no fetch, no
  // reset() — so a rebuild can't discard what the user typed.
  const schema = useMemo(() => makeTollTagSchema(t), [t])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TollTagFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      toll_system: (tag?.toll_system as TollSystemValue) ?? 'EZ TAG',
      tag_number: tag?.tag_number || '',
      status: (tag?.status as 'active' | 'inactive') || 'active',
      notes: tag?.notes || '',
    },
  })

  const onSubmit = async (data: TollTagFormData) => {
    setError(null)

    try {
      const payload: TollTagCreate | TollTagUpdate = {
        toll_system: data.toll_system,
        tag_number: data.tag_number,
        status: data.status,
        notes: data.notes,
      }

      if (!isEdit) {
        (payload as TollTagCreate).vin = vin
      }

      if (isEdit) {
        await updateMutation.mutateAsync({ id: tag.id, ...payload })
      } else {
        await createMutation.mutateAsync(payload as TollTagCreate)
      }

      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common:error'))
    }
  }

  return (
    <FormModalWrapper
      title={isEdit ? t('toll.editTagTitle') : t('toll.createTagTitle')}
      onClose={onClose}
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('tollTagForm.cancel')}
          </Button>
          <Button type="submit" form="toll-tag-form" variant="primary" icon={Save} loading={isSubmitting} disabled={isSubmitting}>
            {isSubmitting ? t('common:saving') : isEdit ? t('toll.updateTag') : t('toll.addTag')}
          </Button>
        </>
      }
    >
        <form id="toll-tag-form" onSubmit={handleSubmit(onSubmit as Parameters<typeof handleSubmit>[0])} className="p-6 space-y-4">
          {error && (
            <div className="bg-danger/10 border border-danger rounded-lg p-3">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field id="toll_system" label={t('toll.tollSystem')} required error={errors.toll_system}>
              <select
                id="toll_system"
                {...register('toll_system')}
                disabled={isSubmitting}
                className={`ui-focus-input ui-motion w-full rounded-control border bg-surface-2 px-3 py-2 text-sm text-text ${errors.toll_system ? 'border-danger' : 'border-border'}`}
              >
                <option value="">{t('toll.selectTollSystem')}</option>
                {TOLL_SYSTEM_OPTIONS.map((system) => (
                  <option key={system.value} value={system.value}>{t(system.labelKey)}</option>
                ))}
              </select>
            </Field>

            <Field id="tag_number" label={t('toll.tagNumber')} required error={errors.tag_number}>
              <Input id="tag_number" type="text" mono {...register('tag_number')} placeholder="e.g., 0012345678" invalid={!!errors.tag_number} disabled={isSubmitting} />
            </Field>
          </div>

          <Field id="status" label={t('common:status')} error={errors.status}>
            <select
              id="status"
              {...register('status')}
              disabled={isSubmitting}
              className={`ui-focus-input ui-motion w-full rounded-control border bg-surface-2 px-3 py-2 text-sm text-text ${errors.status ? 'border-danger' : 'border-border'}`}
            >
              <option value="active">{t('common:active')}</option>
              <option value="inactive">{t('common:inactive')}</option>
            </select>
          </Field>

          <Field id="notes" label={t('common:notes')} error={errors.notes}>
            <Textarea id="notes" rows={3} {...register('notes')} placeholder={t('toll.tagNotesPlaceholder')} invalid={!!errors.notes} disabled={isSubmitting} />
          </Field>
        </form>
    </FormModalWrapper>
  )
}
