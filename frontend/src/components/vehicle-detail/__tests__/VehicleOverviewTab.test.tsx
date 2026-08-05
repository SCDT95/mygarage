import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '../../../__tests__/test-utils'
import type { Vehicle } from '../../../types/vehicle'

// VehicleOverviewTab reads useUnitPreference / useCurrencyPreference / useTimeFormat,
// all of which call useAuth() directly — it throws without an AuthProvider ancestor.
// test-utils' shared `render` wrapper doesn't include one (most of its consumers
// don't need it), so mock the hook here, same pattern as VehicleKeyFacts.test.tsx
// in this same directory.
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false }),
}))

import VehicleOverviewTab from '../VehicleOverviewTab'

// A vehicle whose VIN never decoded: no trim/engine/warranty data at all.
// This is the case the old conditional rendering hid entirely.
const bareVehicle = {
  vin: 'TEST0000000000001',
  nickname: 'Bare',
  vehicle_type: 'Car',
  year: 2019,
  make: 'Mitsubishi',
  model: 'Mirage',
  usage_unit: 'distance',
  secondary_usage_enabled: false,
} as unknown as Vehicle

const trailer = { ...bareVehicle, vehicle_type: 'Trailer' } as unknown as Vehicle

function renderTab(vehicle: Vehicle, onEditCard = vi.fn()) {
  render(
    <VehicleOverviewTab
      vin={vehicle.vin}
      vehicle={vehicle}
      lastLocation={null}
      onOpenModal={vi.fn()}
      onDownloadWindowSticker={vi.fn()}
      onEditPricing={vi.fn()}
      onEditCard={onEditCard}
    />,
  )
  return { onEditCard }
}

describe('VehicleOverviewTab — cards stay addable when the vehicle has no decoded data', () => {
  it('renders Vehicle Details and Powertrain for a vehicle with none of their fields', () => {
    renderTab(bareVehicle)
    expect(screen.getByRole('heading', { name: 'detail.vehicleDetails' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'detail.powertrain' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'detail.warranty' })).toBeInTheDocument()
  })

  it('offers an edit affordance on each empty card, so the fields can be ADDED', () => {
    const { onEditCard } = renderTab(bareVehicle)
    // All four onEditCard cards (basic, details, powertrain, warranty) carry the
    // shared CardEditOverlay. Its accessible name is the same for every card,
    // because the global i18n mock discards interpolation — so count them
    // rather than querying by section name.
    const overlays = screen.getAllByRole('button', { name: 'detail.cardEdit.title' })
    expect(overlays).toHaveLength(4)
    // DOM order is basic, details, powertrain, warranty. Clicking the EMPTY
    // Details card must open the Details editor — without this an empty card is
    // a dead end, which is the failure this whole task exists to prevent.
    fireEvent.click(overlays[1])
    expect(onEditCard).toHaveBeenCalledWith('details')
  })

  it('shows the empty-state line instead of a blank card body', () => {
    renderTab(bareVehicle)
    // One line per empty card: Details, Powertrain, Warranty.
    expect(screen.getAllByText('detail.cardEmpty')).toHaveLength(3)
  })

  it('still hides Powertrain for a non-motorized vehicle', () => {
    renderTab(trailer)
    // A trailer has no engine; an empty engine card there is noise, not an
    // affordance. Details and Warranty still render.
    expect(screen.queryByRole('heading', { name: 'detail.powertrain' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'detail.vehicleDetails' })).toBeInTheDocument()
  })

  it('renders real values rather than the empty line when data exists', () => {
    renderTab({ ...bareVehicle, trim: 'Limited', cylinders: 4 } as unknown as Vehicle)
    expect(screen.getByText('Limited')).toBeInTheDocument()
    // Details and Powertrain now have data; only Warranty is empty.
    expect(screen.getAllByText('detail.cardEmpty')).toHaveLength(1)
  })
})
