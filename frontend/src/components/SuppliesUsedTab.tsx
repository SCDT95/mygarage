import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Package } from 'lucide-react'
import { useVehicleSupplyUsages } from '@/hooks/queries/useSupplies'
import { useCurrencyPreference } from '@/hooks/useCurrencyPreference'
import { useDateLocale } from '@/hooks/useDateLocale'
import { formatDateForDisplay } from '@/utils/dateUtils'
import type { SupplyUsage } from '@/types/supplies'

interface SuppliesUsedTabProps {
  vin: string
}

// SupplyUsageResponse carries only the canonical quantity, not the owning
// supply's unit_type, so there's no reliable way to render a display unit
// here (Task 18 brief) — show the stored magnitude as-is rather than
// fabricating a unit suffix.
function formatQuantity(raw: string, locale: string): string {
  const value = Number(raw)
  if (Number.isNaN(value)) return raw
  return value.toLocaleString(locale, { maximumFractionDigits: 3 })
}

export default function SuppliesUsedTab({ vin }: SuppliesUsedTabProps) {
  const { t } = useTranslation('common')
  const { data, isLoading, error } = useVehicleSupplyUsages(vin)
  const { formatCurrency } = useCurrencyPreference()
  const dateLocale = useDateLocale()

  const usages: SupplyUsage[] = data?.usages ?? []

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <div className="text-garage-text-muted">{t('supplies.usedTab.loading')}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 bg-danger/10 border border-danger rounded-lg p-4">
        <AlertTriangle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
        <p className="text-danger">
          {error instanceof Error ? error.message : t('supplies.usedTab.loadError')}
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-garage-text">{t('supplies.usedTab.title')}</h2>
        <p className="text-sm text-garage-text-muted">
          {t('supplies.usedTab.count', { count: usages.length })}
        </p>
      </div>

      {usages.length === 0 ? (
        <div className="text-center py-12 bg-garage-surface rounded-lg">
          <Package size={48} className="mx-auto text-garage-text-muted mb-4" />
          <p className="text-garage-text-muted">{t('supplies.usedTab.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {usages.map((usage) => (
            <div
              key={usage.id}
              className="flex items-start justify-between gap-4 bg-garage-surface rounded-lg p-4 border border-garage-border"
            >
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-garage-text">{usage.supply_name}</h3>
                <p className="text-xs text-garage-text-muted mt-0.5">
                  {t('supplies.usedTab.quantity')}: {formatQuantity(usage.quantity, dateLocale)}
                </p>
                {usage.service_visit_date && (
                  <p className="text-xs text-garage-text-muted mt-0.5">
                    {formatDateForDisplay(usage.service_visit_date, undefined, dateLocale)}
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="text-sm font-medium text-garage-text">
                  {formatCurrency(usage.cost_snapshot)}
                </span>
                {usage.service_visit_id != null && (
                  <Link
                    to={`/vehicles/${vin}?tab=service`}
                    className="text-xs text-primary hover:underline"
                  >
                    {t('supplies.usedTab.viewVisit')}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
