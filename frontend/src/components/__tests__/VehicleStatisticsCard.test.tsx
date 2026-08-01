import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, fireEvent } from '../../__tests__/test-utils'
import type { VehicleStatistics } from '../../types/dashboard'
import { UnitFormatter } from '../../utils/units'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false }),
}))
// The LiveLink widget fetches on mount — make it render nothing (no device).
vi.mock('@/services/livelinkService', () => ({
  livelinkService: {
    getVehicleStatus: vi.fn().mockRejectedValue(new Error('no device')),
  },
}))
// LOCAL i18n mock (same pattern as FuelRecordList's B7 fix): the GLOBAL
// setup.ts mock is `t: (key) => key`, which discards interpolation args, so
// `t('vehicleStats.hoursValue', { value })` / `t('...averageFuelEconomy', { unit })`
// render the identical string regardless of the option — tests below need the
// value/unit to come through to prove latest_hours (not the stale current_hours
// column) drives the display, and to tell the MPG strip from the GPH strip.
// Otherwise behaviour-identical to the global mock (bare key), so the
// pre-existing tests stay green.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { value?: unknown; unit?: string }) => {
      if (options?.value != null) return `${key} (${options.value})`
      if (options?.unit) return `${key} (${options.unit})`
      return key
    },
    i18n: { language: 'en', changeLanguage: () => Promise.resolve() },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

import VehicleStatisticsCard from '../VehicleStatisticsCard'

const STATS: VehicleStatistics = {
  vin: '1HGBH41JXMN109186',
  year: 2021,
  make: 'Ford',
  model: 'F-150',
  vehicle_type: 'FifthWheel',
  main_photo_url: null,
  usage_unit: 'distance',
  current_hours: null,
  latest_hours: null,
  average_l_per_hr: null,
  average_cost_per_hr: null,
  secondary_usage_enabled: false,
  total_service_records: 0,
  total_fuel_records: 0,
  total_odometer_records: 0,
  total_maintenance_items: 0,
  total_documents: 0,
  total_notes: 0,
  total_photos: 0,
  latest_service_date: null,
  latest_fuel_date: null,
  latest_odometer_km: null,
  latest_odometer_date: null,
  upcoming_maintenance_count: 0,
  overdue_maintenance_count: 0,
  average_l_per_100km: null,
  recent_l_per_100km: null,
  archived_at: null,
  archived_visible: false,
  is_shared_with_me: false,
  shared_by_username: null,
  share_permission: null,
}

describe('VehicleStatisticsCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the translated vehicle-type label, never the raw enum value', () => {
    render(<VehicleStatisticsCard stats={STATS} />)
    // Mapped through vehicleTypeLabels.* -> the key under the vitest i18n mock,
    // proving raw 'FifthWheel' is never shown to the user.
    expect(screen.getByText('vehicleTypeLabels.FifthWheel')).toBeInTheDocument()
    expect(screen.queryByText('FifthWheel')).not.toBeInTheDocument()
  })

  it('navigates to the vehicle via the whole-card stretched-link button', () => {
    render(<VehicleStatisticsCard stats={STATS} />)
    fireEvent.click(
      screen.getByRole('button', { name: /vehicleStatisticsCardExtra\.viewDetails/ }),
    )
    expect(mockNavigate).toHaveBeenCalledWith('/vehicles/1HGBH41JXMN109186')
  })

  it('shows the odometer row and MPG strip for a distance-tracked vehicle', () => {
    render(
      <VehicleStatisticsCard
        stats={{
          ...STATS,
          usage_unit: 'distance',
          total_odometer_records: 1,
          latest_odometer_km: '5000',
          average_l_per_100km: '8.5',
        }}
      />
    )
    expect(screen.getByText('vehicleStats.latestOdometer')).toBeInTheDocument()
    expect(screen.queryByText('vehicleStats.latestHours')).not.toBeInTheDocument()
    expect(screen.getByText('vehicleStatisticsCardExtra.averageFuelEconomy (MPG)')).toBeInTheDocument()
  })

  it('shows Latest Hours from latest_hours (NOT the stale current_hours column) + fuel-rate economy, hides odometer + MPG for a pure-hours vehicle', () => {
    render(
      <VehicleStatisticsCard
        stats={{
          ...STATS,
          vehicle_type: 'ATV',
          usage_unit: 'hours',
          current_hours: '999.9', // decoy stale column — must be ignored
          latest_hours: '123.5',
          average_l_per_hr: '0.95',
          // Present in the data but must be IGNORED when tracking hours only:
          latest_odometer_km: '5000',
          average_l_per_100km: '8.5',
        }}
      />
    )
    expect(screen.getByText('vehicleStats.latestHours')).toBeInTheDocument()
    expect(screen.getByText('vehicleStats.hoursValue (123.5)')).toBeInTheDocument()
    expect(screen.queryByText('vehicleStats.hoursValue (999.9)')).not.toBeInTheDocument()
    expect(screen.queryByText('vehicleStats.latestOdometer')).not.toBeInTheDocument()
    // Distance-based MPG strip is hidden for hour vehicles; GPH shown instead.
    expect(screen.queryByText('vehicleStatisticsCardExtra.averageFuelEconomy (MPG)')).not.toBeInTheDocument()
    const expectedRate = UnitFormatter.formatFuelRate(0.95, 'imperial', false)
    expect(screen.getByText('vehicleStatisticsCardExtra.averageFuelEconomy (GPH)')).toBeInTheDocument()
    expect(screen.getByText(expectedRate)).toBeInTheDocument()
  })

  it('dual-tracking vehicle shows BOTH distance + hours activity rows and BOTH economy strips', () => {
    render(
      <VehicleStatisticsCard
        stats={{
          ...STATS,
          usage_unit: 'distance',
          secondary_usage_enabled: true,
          total_odometer_records: 1,
          latest_odometer_km: '5000',
          latest_hours: '321.75',
          average_l_per_100km: '8.5',
          average_l_per_hr: '0.95',
        }}
      />
    )
    expect(screen.getByText('vehicleStats.latestOdometer')).toBeInTheDocument()
    expect(screen.getByText('vehicleStats.latestHours')).toBeInTheDocument()
    expect(screen.getByText('vehicleStats.hoursValue (321.75)')).toBeInTheDocument()
    expect(screen.getByText('vehicleStatisticsCardExtra.averageFuelEconomy (MPG)')).toBeInTheDocument()
    expect(screen.getByText('vehicleStatisticsCardExtra.averageFuelEconomy (GPH)')).toBeInTheDocument()
  })

  it('never reads stats.current_hours (grep-style source check — the stale column is retired)', () => {
    const src = readFileSync(resolve(__dirname, '../VehicleStatisticsCard.tsx'), 'utf8')
    expect(src).not.toMatch(/current_hours/)
  })
})
