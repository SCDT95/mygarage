import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { afterEach } from 'vitest'
import { UnitConverter } from '../../utils/units'
import type { VehicleAnalytics, HoursEconomyDataPoint, HoursAccumulatedDataPoint } from '../../types/analytics'

// ─────────────────────────────────────────────────────────────────────────────
// M4 (recharts component-boundary mock, mirrors LiveLinkChartsTab.test.tsx):
// recharts renders 0×0 in jsdom, so stub the chart components rather than the
// SVG internals. LineChart is the only one that matters for these assertions —
// it's stubbed to CAPTURE its `data` prop (pushed into an array, since
// Analytics.tsx mounts MULTIPLE LineCharts at once — cost trend, fuel-economy
// trend, and now the two new hours charts). Every other recharts export
// Analytics.tsx imports is stubbed too (pass-through or no-op) so nothing
// touches real SVG/measurement code.
// ─────────────────────────────────────────────────────────────────────────────
const captured = vi.hoisted(() => ({ lineCharts: [] as unknown[] }))
vi.mock('recharts', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>
  return {
    ResponsiveContainer: Pass,
    LineChart: ({ data, children }: { data: unknown; children?: ReactNode }) => {
      captured.lineCharts.push(data)
      return <>{children}</>
    },
    BarChart: Pass,
    PieChart: Pass,
    RadarChart: Pass,
    Line: () => null,
    Bar: () => null,
    Pie: () => null,
    Cell: () => null,
    Radar: () => null,
    PolarGrid: () => null,
    PolarAngleAxis: () => null,
    PolarRadiusAxis: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
  }
})

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    defaults: { headers: { common: {} } },
  },
}))

const unitPreferenceMock = vi.fn()
vi.mock('../../hooks/useUnitPreference', () => ({
  useUnitPreference: () => unitPreferenceMock(),
}))
vi.mock('../../hooks/useCurrencyPreference', () => ({
  useCurrencyPreference: () => ({ currencyCode: 'USD', locale: 'en-US' }),
}))
vi.mock('../../hooks/useCurrencySymbol', () => ({
  useCurrencySymbol: () => '$',
}))
vi.mock('../../hooks/useDateLocale', () => ({
  useDateLocale: () => 'en-US',
}))

import api from '../../services/api'
import Analytics from '../Analytics'

const mockedApiGet = vi.mocked(api).get

// Full, contract-valid VehicleAnalytics fixture. `cost_analysis.monthly_breakdown`
// and `fuel_economy.data_points` default EMPTY so the pre-existing cost-trend and
// fuel-economy LineCharts don't mount in these hours-focused tests — that keeps
// `captured.lineCharts` limited to the charts under test. Individual tests
// override fields (via `overrides`) to exercise gating and regression checks.
function baseAnalytics(overrides: Partial<VehicleAnalytics> = {}): VehicleAnalytics {
  return {
    vehicle_name: 'Test Tractor',
    vehicle_type: 'Car',
    vin: 'V1',
    days_owned: 100,
    total_km_driven: null,
    average_km_per_month: null,
    cost_analysis: {
      total_cost: '0.00',
      average_monthly_cost: '0.00',
      months_tracked: 0,
      service_count: 0,
      fuel_count: 0,
      def_count: 0,
      cost_per_km: null,
      rolling_avg_3m: null,
      rolling_avg_6m: null,
      rolling_avg_12m: null,
      trend_direction: 'stable',
      total_service_cost: '0.00',
      total_fuel_cost: '0.00',
      total_def_cost: '0.00',
      monthly_breakdown: [],
      service_type_breakdown: [],
      anomalies: [],
    },
    cost_projection: {
      monthly_average: '0.00',
      six_month_projection: '0.00',
      twelve_month_projection: '0.00',
      assumptions: 'Projection assumes spending remains at recent averages.',
    },
    fuel_economy: {
      average_l_per_100km: null,
      best_l_per_100km: null,
      worst_l_per_100km: null,
      recent_l_per_100km: null,
      trend: 'stable',
      data_points: [],
    },
    hours_economy: {
      average_l_per_hr: null,
      average_cost_per_hr: null,
      best_l_per_hr: null,
      worst_l_per_hr: null,
      recent_l_per_hr: null,
      recent_cost_per_hr: null,
      trend: 'stable',
      data_points: [],
    },
    hours_accumulated: [],
    fuel_alerts: [],
    service_history: [],
    predictions: [],
    propane_analysis: null,
    spot_rental_analysis: null,
    def_analysis: null,
    ...overrides,
  } satisfies VehicleAnalytics
}

function mockAnalyticsResponse(analytics: VehicleAnalytics): void {
  mockedApiGet.mockImplementation((url: string) => {
    if (url.endsWith('/vendors')) return Promise.reject(new Error('no vendors'))
    if (url.endsWith('/seasonal')) return Promise.reject(new Error('no seasonal'))
    return Promise.resolve({ data: analytics })
  })
}

function renderAnalytics(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/vehicles/V1/analytics']}>
      <Routes>
        <Route path="/vehicles/:vin/analytics" element={<Analytics />} />
      </Routes>
    </MemoryRouter>
  )
}

/** First captured LineChart `data` array whose points carry `key`. */
function findChartData(key: string): unknown[] | undefined {
  return captured.lineCharts.find((rows): rows is unknown[] =>
    Array.isArray(rows) && rows.length > 0 && typeof rows[0] === 'object' && rows[0] !== null && key in (rows[0] as Record<string, unknown>)
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  captured.lineCharts = []
  unitPreferenceMock.mockReturnValue({ system: 'metric', showBoth: false })
})

afterEach(() => {
  cleanup()
})

const HOURS_ECONOMY_POINTS: HoursEconomyDataPoint[] = [
  { date: '2026-07-01', engine_hours: '810.0', l_per_hr: '3.80', cost_per_hr: '2.75', liters: '19.00', cost: '13.68' },
  // Zero-liters interval: l_per_hr is null (never 0) per the backend contract —
  // cost_per_hr still scores. Proves the null point is KEPT, not dropped.
  { date: '2026-07-02', engine_hours: '815.0', l_per_hr: null, cost_per_hr: '0.00', liters: '0.00', cost: '0.00' },
]

const HOURS_ACCUMULATED_POINTS: HoursAccumulatedDataPoint[] = [
  { date: '2026-06-01', engine_hours: '800.0' },
  { date: '2026-07-01', engine_hours: '812.4' },
]

describe('Analytics — hours efficiency chart (Task 17)', () => {
  it('projects hours_economy data_points into the LineChart data prop, metric (fails if l_per_hr/cost_per_hr stop mapping)', async () => {
    mockAnalyticsResponse(baseAnalytics({
      hours_economy: {
        average_l_per_hr: '3.80', average_cost_per_hr: '2.75', best_l_per_hr: '3.80', worst_l_per_hr: '3.80',
        recent_l_per_hr: '3.80', recent_cost_per_hr: '2.75', trend: 'stable', data_points: HOURS_ECONOMY_POINTS,
      },
    }))
    renderAnalytics()
    await waitFor(() => expect(screen.getByText('vehicle.hoursEconomyAnalysis')).toBeInTheDocument())

    const data = findChartData('lPerHr')
    expect(data).toStrictEqual([
      { date: 'Jul 1', lPerHr: 3.8, displayFuelRate: 3.8, costPerHr: 2.75 },
      { date: 'Jul 2', lPerHr: null, displayFuelRate: null, costPerHr: 0 },
    ])
  })

  it('converts l_per_hr to GPH (gallons/hour) for the displayed series when imperial (canonical lPerHr stays in L/hr)', async () => {
    unitPreferenceMock.mockReturnValue({ system: 'imperial', showBoth: false })
    mockAnalyticsResponse(baseAnalytics({
      hours_economy: {
        average_l_per_hr: '3.80', average_cost_per_hr: '2.75', best_l_per_hr: '3.80', worst_l_per_hr: '3.80',
        recent_l_per_hr: '3.80', recent_cost_per_hr: '2.75', trend: 'stable', data_points: HOURS_ECONOMY_POINTS,
      },
    }))
    renderAnalytics()
    await waitFor(() => expect(screen.getByText('vehicle.hoursEconomyAnalysis')).toBeInTheDocument())

    const data = findChartData('lPerHr') as { lPerHr: number | null; displayFuelRate: number | null }[]
    expect(data[0].lPerHr).toBe(3.8) // canonical, unconverted
    expect(data[0].displayFuelRate).toBe(UnitConverter.litersToGallons(3.8)) // converted for display
    expect(data[1].displayFuelRate).toBeNull() // null point stays null, not 0
  })
})

describe('Analytics — hours accumulated chart (Task 17)', () => {
  it('projects hours_accumulated (date, engine_hours) into the LineChart data prop', async () => {
    mockAnalyticsResponse(baseAnalytics({ hours_accumulated: HOURS_ACCUMULATED_POINTS }))
    renderAnalytics()
    await waitFor(() => expect(screen.getByText('vehicle.hoursAccumulatedTitle')).toBeInTheDocument())

    const data = findChartData('engineHours')
    expect(data).toStrictEqual([
      { date: 'Jun 1', engineHours: 800 },
      { date: 'Jul 1', engineHours: 812.4 },
    ])
  })
})

describe('Analytics — hours chart gating (Task 17)', () => {
  it('hides both hours charts for a pure-distance vehicle, and leaves the existing fuel-economy chart unchanged (regression)', async () => {
    mockAnalyticsResponse(baseAnalytics({
      fuel_economy: {
        average_l_per_100km: '8.50', best_l_per_100km: '7.00', worst_l_per_100km: '10.00', recent_l_per_100km: '8.00',
        trend: 'stable',
        data_points: [{ date: '2026-07-01', l_per_100km: '8.00', odometer_km: '1000', liters: '40', cost: '60.00' }],
      },
    }))
    renderAnalytics()
    await waitFor(() => expect(screen.getByText('vehicle.fuelEconomyTrendTitle')).toBeInTheDocument())

    expect(screen.queryByText('vehicle.hoursEconomyAnalysis')).not.toBeInTheDocument()
    expect(screen.queryByText('vehicle.hoursAccumulatedTitle')).not.toBeInTheDocument()
    // Regression: the pre-existing fuel-economy LineChart still projects its data untouched.
    expect(findChartData('lPer100km')).toStrictEqual([
      { date: 'Jul 1', lPer100km: 8, displayFuelEconomy: 8, odometer_km: 1000 },
    ])
  })

  it('shows both hours charts (dual) for a vehicle tracking both distance and hours', async () => {
    mockAnalyticsResponse(baseAnalytics({
      hours_economy: {
        average_l_per_hr: '3.80', average_cost_per_hr: '2.75', best_l_per_hr: '3.80', worst_l_per_hr: '3.80',
        recent_l_per_hr: '3.80', recent_cost_per_hr: '2.75', trend: 'stable', data_points: HOURS_ECONOMY_POINTS,
      },
      hours_accumulated: HOURS_ACCUMULATED_POINTS,
    }))
    renderAnalytics()
    await waitFor(() => expect(screen.getByText('vehicle.hoursEconomyAnalysis')).toBeInTheDocument())

    expect(screen.getByText('vehicle.hoursAccumulatedTitle')).toBeInTheDocument()
    expect(findChartData('lPerHr')).toHaveLength(2)
    expect(findChartData('engineHours')).toHaveLength(2)
  })

  it('shows only the hours charts (pure-hours vehicle, no distance fuel-economy data)', async () => {
    mockAnalyticsResponse(baseAnalytics({
      hours_economy: {
        average_l_per_hr: '3.80', average_cost_per_hr: '2.75', best_l_per_hr: '3.80', worst_l_per_hr: '3.80',
        recent_l_per_hr: '3.80', recent_cost_per_hr: '2.75', trend: 'stable', data_points: HOURS_ECONOMY_POINTS,
      },
      hours_accumulated: HOURS_ACCUMULATED_POINTS,
    }))
    renderAnalytics()
    await waitFor(() => expect(screen.getByText('vehicle.hoursEconomyAnalysis')).toBeInTheDocument())

    expect(screen.queryByText('vehicle.fuelEconomyTrendTitle')).not.toBeInTheDocument()
  })
})
