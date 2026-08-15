import { Shield, Plus, Trash2, Edit3, Calendar } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { InsurancePolicy } from '../types/insurance'
import { useInsuranceRecords, useDeleteInsuranceRecord } from '../hooks/queries/useInsuranceRecords'
import { formatDateForDisplay, formatDateForInput } from '../utils/dateUtils'
import { useDateLocale } from '../hooks/useDateLocale'
import { formatCurrency } from '../utils/formatUtils'
import { useCurrencyPreference } from '../hooks/useCurrencyPreference'
import { getActionErrorMessage } from '../utils/httpErrorHandler'
import { Button, IconButton, Mono, EmptyState } from './ui'

interface InsuranceListProps {
  vin: string
  onAddClick: () => void
  onEditClick: (policy: InsurancePolicy) => void
}

export default function InsuranceList({ vin, onAddClick, onEditClick }: InsuranceListProps) {
  const { t } = useTranslation('vehicles')
  const { data: policies = [], isLoading, error } = useInsuranceRecords(vin)
  const deleteMutation = useDeleteInsuranceRecord(vin)
  const dateLocale = useDateLocale()
  const { currencyCode, locale } = useCurrencyPreference()

  const handleDelete = (policyId: number) => {
    if (!confirm(t('insuranceList.confirmDelete'))) {
      return
    }

    deleteMutation.mutate(policyId, {
      onError: (err) => {
        toast.error(getActionErrorMessage(err, t('insuranceList.deleteAction')))
      },
    })
  }

  const formatDate = (dateString: string): string => {
    return formatDateForDisplay(dateString, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }, dateLocale)
  }

  const isExpired = (endDate: string): boolean => {
    // end_date is a backend `date` (YYYY-MM-DD), not a datetime. Compare as
    // calendar days in the user's local timezone via lexicographic YYYY-MM-DD
    // comparison — avoids the UTC-midnight drift a Date-based compare would
    // introduce for users west of UTC.
    return endDate < formatDateForInput()
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <div className="text-text-mute">{t('insuranceList.loading')}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-danger/10 border border-danger rounded-lg p-4">
        <p className="text-danger">{error.message}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-text">{t('insuranceList.title')}</h2>
          <p className="text-sm text-text-mute">{t('insuranceList.policyCount', { count: policies.length })}</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={onAddClick}>{t('insuranceList.addPolicy')}</Button>
      </div>

      {policies.length === 0 ? (
        <EmptyState
          icon={Shield}
          title={t('insuranceList.noRecords')}
          action={<Button variant="primary" icon={Plus} onClick={onAddClick}>{t('insuranceList.addFirstPolicy')}</Button>}
        />
      ) : (
        <div className="space-y-4">
          {policies.map((policy) => (
            <div
              key={policy.id}
              className={`bg-surface rounded-card p-6 border ${
                isExpired(policy.end_date) ? 'border-danger/30' : 'border-border'
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-start gap-3">
                  <Shield aria-hidden="true" size={20} className={isExpired(policy.end_date) ? 'text-danger mt-1' : 'text-(--accent-fg) mt-1'} />
                  <div>
                    <h3 className="text-lg font-semibold text-text">{policy.provider}</h3>
                    <p className="text-sm text-text-mute">{policy.policy_type}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <IconButton icon={Edit3} label={t('common:edit')} variant="ghost" size="sm" onClick={() => onEditClick(policy)} />
                  <IconButton
                    icon={Trash2}
                    label={t('common:delete')}
                    variant="danger"
                    size="sm"
                    disabled={deleteMutation.isPending && deleteMutation.variables === policy.id}
                    onClick={() => handleDelete(policy.id)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-xs text-text-mute mb-1">{t('insuranceList.policyNumber')}</p>
                  <Mono size="sm" tabular={false} className="text-text">{policy.policy_number}</Mono>
                </div>
                <div>
                  <p className="text-xs text-text-mute mb-1">{t('insuranceList.startDate')}</p>
                  <Mono size="sm" className="text-text">{formatDate(policy.start_date)}</Mono>
                </div>
                <div>
                  <p className="text-xs text-text-mute mb-1">{t('insuranceList.endDate')}</p>
                  <Mono size="sm" className="text-text">{formatDate(policy.end_date)}</Mono>
                </div>
                {policy.premium_amount && (
                  <div>
                    <p className="text-xs text-text-mute mb-1">{t('insuranceList.premiumAmount')}</p>
                    <p className="text-sm text-text">
                      <Mono size="sm">{formatCurrency(policy.premium_amount, { currencyCode, locale })}</Mono>
                      {policy.premium_frequency && ` / ${policy.premium_frequency}`}
                    </p>
                  </div>
                )}
              </div>

              {policy.deductible && (
                <div className="mb-2">
                  <p className="text-xs text-text-mute mb-1">{t('insuranceList.deductible')}</p>
                  <Mono size="sm" className="text-text">{formatCurrency(policy.deductible, { currencyCode, locale })}</Mono>
                </div>
              )}

              {policy.coverage_limits && (
                <div className="mb-2">
                  <p className="text-xs text-text-mute mb-1">{t('insuranceList.coverageLimits')}</p>
                  <p className="text-sm text-text whitespace-pre-wrap">{policy.coverage_limits}</p>
                </div>
              )}

              {policy.notes && (
                <div>
                  <p className="text-xs text-text-mute mb-1">{t('insuranceList.notes')}</p>
                  <p className="text-sm text-text whitespace-pre-wrap">{policy.notes}</p>
                </div>
              )}

              {isExpired(policy.end_date) && (
                <div className="mt-4 text-sm text-danger flex items-center gap-2">
                  <Calendar aria-hidden="true" size={16} />{t('insuranceList.expired')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
