import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../__tests__/test-utils'

// Deterministic api mock — each test sets the resolved /dashboard payload.
const mockGet = vi.fn()
vi.mock('../../services/api', () => ({
  default: { get: (...args: unknown[]) => mockGet(...args) },
}))

// Isolate the Dashboard: stub the card to a stable node we can read the order
// of, and neutralise the auth-context dependency of the (later) fleet strip.
vi.mock('../../components/VehicleStatisticsCard', () => ({
  default: ({
    stats,
  }: {
    stats: { year: number | null; make: string | null; model: string | null }
  }) => <div data-testid="vehicle-card">{`${stats.year} ${stats.make} ${stats.model}`}</div>,
}))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false }),
}))

import Dashboard from '../Dashboard'

function vehicle(v: {
  vin: string
  year: number
  make: string
  model: string
  is_shared_with_me?: boolean
}): Record<string, unknown> {
  return {
    main_photo_url: null,
    vehicle_type: 'Car',
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
    ...v,
  }
}

function payload(vehicles: Record<string, unknown>[]): { data: Record<string, unknown> } {
  return {
    data: {
      total_vehicles: vehicles.length,
      vehicles,
      total_service_records: 0,
      total_fuel_records: 0,
      total_maintenance_items: 0,
      total_documents: 0,
      total_notes: 0,
      total_photos: 0,
      fleet_health: {
        overdue_count: 0,
        upcoming_30d_count: 0,
        year: 2026,
        spent_this_year: '0.00',
        next_due: null,
      },
    },
  }
}

const order = (): string[] =>
  screen.getAllByTestId('vehicle-card').map((el) => el.textContent ?? '')

describe('Dashboard sort/filter behaviour', () => {
  beforeEach(() => vi.clearAllMocks())

  it('re-sorts the grid when a Sort option is chosen', async () => {
    mockGet.mockResolvedValue(
      payload([
        vehicle({ vin: 'A', year: 2019, make: 'Aston', model: 'X' }),
        vehicle({ vin: 'B', year: 2022, make: 'BMW', model: 'X' }),
        vehicle({ vin: 'C', year: 2020, make: 'Chevy', model: 'X' }),
      ]),
    )
    render(<Dashboard />)
    // Default sort 'name' -> "2019 Aston" < "2020 Chevy" < "2022 BMW".
    await waitFor(() =>
      expect(order()).toEqual(['2019 Aston X', '2020 Chevy X', '2022 BMW X']),
    )

    // Open the Sort dropdown (by its accessible label) and choose Newest First.
    fireEvent.click(screen.getByRole('button', { name: 'dashboard.sortVehicles' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'dashboard.newestFirst' }))

    // year-new -> 2022, 2020, 2019. Order actually changed.
    await waitFor(() =>
      expect(order()).toEqual(['2022 BMW X', '2020 Chevy X', '2019 Aston X']),
    )
  })

  it('filters to owned-only when Filter -> My Vehicles is chosen', async () => {
    mockGet.mockResolvedValue(
      payload([
        vehicle({ vin: 'OWN', year: 2021, make: 'Owned', model: 'Y' }),
        vehicle({ vin: 'SHR', year: 2021, make: 'Shared', model: 'Y', is_shared_with_me: true }),
      ]),
    )
    render(<Dashboard />)
    // The filter dropdown exists only because a shared vehicle is present.
    await waitFor(() => expect(order()).toHaveLength(2))

    fireEvent.click(screen.getByRole('button', { name: 'dashboard.filterVehicles' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'dashboard.myVehicles' }))

    // Shared vehicle filtered out — the subset actually changed.
    await waitFor(() => expect(order()).toEqual(['2021 Owned Y']))
  })
})
