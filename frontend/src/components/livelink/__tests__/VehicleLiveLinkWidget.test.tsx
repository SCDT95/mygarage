import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '../../../__tests__/test-utils'
import type { VehicleLiveLinkStatus } from '../../../types/livelink'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false }),
}))

// A parked (not running) device is the minimal status that makes the widget
// render its role="button" region — the running-only metrics grid isn't
// needed to exercise the keydown handler. Defined via vi.hoisted since
// vi.mock factories are hoisted above regular top-level const declarations
// (VIN lives inside the same hoisted block so the literal isn't repeated).
const { VIN, STATUS } = vi.hoisted(() => {
  const VIN = '1HGBH41JXMN109186'
  return {
    VIN,
    STATUS: {
      device_id: 'wican-1',
      device_status: 'online',
      ecu_status: 'offline',
      vin: VIN,
      latest_values: [],
    } satisfies VehicleLiveLinkStatus,
  }
})

vi.mock('@/services/livelinkService', () => ({
  livelinkService: {
    getVehicleStatus: vi.fn().mockResolvedValue(STATUS),
  },
}))

import VehicleLiveLinkWidget from '../VehicleLiveLinkWidget'

describe('VehicleLiveLinkWidget keyboard activation (I12 a11y fix)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('activates navigation on Enter and Space, and does not bubble to a parent handler', async () => {
    // The region is a sibling control inside a stretched-link card (see
    // VehicleStatisticsCard) — a parent onKeyDown proxies the card's own
    // whole-card handler, so this proves stopPropagation actually holds.
    const parentKeyDown = vi.fn()
    render(
      <div onKeyDown={parentKeyDown}>
        <VehicleLiveLinkWidget vin={VIN} />
      </div>,
    )

    const region = await screen.findByRole('button', { name: 'livelink.widget.title' })

    fireEvent.keyDown(region, { key: 'Enter' })
    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith(`/vehicles/${VIN}?tab=live`)

    fireEvent.keyDown(region, { key: ' ' })
    expect(mockNavigate).toHaveBeenCalledTimes(2)
    expect(mockNavigate).toHaveBeenLastCalledWith(`/vehicles/${VIN}?tab=live`)

    expect(parentKeyDown).not.toHaveBeenCalled()
  })

  it('ignores other keys', async () => {
    render(<VehicleLiveLinkWidget vin={VIN} />)
    const region = await screen.findByRole('button', { name: 'livelink.widget.title' })

    fireEvent.keyDown(region, { key: 'Tab' })
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
