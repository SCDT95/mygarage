import { useTranslation } from 'react-i18next'
import { Wrench, Fuel, DollarSign, Bell } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { VehicleDetailStats } from '../../types/vehicle'
import { useCurrencyPreference } from '../../hooks/useCurrencyPreference'
import { useDateLocale } from '../../hooks/useDateLocale'
import { formatCurrency } from '../../utils/formatUtils'
import { formatDateForDisplay } from '../../utils/dateUtils'
import { Mono } from '../ui'

interface VehicleKeyFactsProps {
  stats: VehicleDetailStats
}

/**
 * Vehicle Detail key-facts strip (P5 Task 5). Bespoke hairline grid (G4 (b)) —
 * four cells: Last Service / Last Fill-up / Spent {year} / Upcoming. The
 * odometer reading and overdue count live in the hero (Task 3), so this strip
 * renders the remaining four contract fields (each shown exactly once).
 */
export default function VehicleKeyFacts({ stats }: VehicleKeyFactsProps) {
  const { t } = useTranslation('vehicles')
  const { currencyCode, locale } = useCurrencyPreference()
  const dateLocale = useDateLocale()

  const fmtDate = (d: string | null | undefined): string =>
    d
      ? formatDateForDisplay(d, { year: 'numeric', month: 'short', day: 'numeric' }, dateLocale)
      : t('detail.notSpecified')

  // Each cell is a role="group" whose accessible name is its label (B9). The
  // value lives inside that group, so a test can bind value↔label with
  // `within(getByRole('group', { name: label }))` — swapping last_service_date
  // and last_fillup_date then fails, which a bare getByText could not catch.
  const cell = (icon: LucideIcon, ariaLabel: string, label: ReactNode, value: ReactNode) => {
    const Icon = icon
    return (
      <div role="group" aria-label={ariaLabel} className="flex items-center gap-3 bg-surface px-4 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface-2 text-text-mute">
          <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-text">{value}</div>
          <div className="mt-0.5 text-[11px] text-text-mute">{label}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-panel border border-border bg-hair sm:grid-cols-2 lg:grid-cols-4">
      {cell(
        Wrench,
        t('vehicleStats.lastService'),
        t('vehicleStats.lastService'),
        <Mono size="lg" weight="semibold">{fmtDate(stats.last_service_date)}</Mono>,
      )}
      {cell(
        Fuel,
        t('vehicleStats.lastFillUp'),
        t('vehicleStats.lastFillUp'),
        <Mono size="lg" weight="semibold">{fmtDate(stats.last_fillup_date)}</Mono>,
      )}
      {cell(
        DollarSign,
        t('detail.keyFacts.spent'),
        <>{t('detail.keyFacts.spent')} {stats.year}</>,
        <Mono size="lg" weight="semibold">{formatCurrency(stats.spent_this_year, { currencyCode, locale, zeroIsValid: true })}</Mono>,
      )}
      {cell(Bell, t('detail.keyFacts.upcoming'), t('detail.keyFacts.upcoming'), <Mono size="lg" weight="semibold">{stats.upcoming_count}</Mono>)}
    </div>
  )
}
