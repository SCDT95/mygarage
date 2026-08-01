import type { ComponentProps } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { render } from '../../../__tests__/test-utils'
import EquipmentDrawer from '../EquipmentDrawer'
import vehicleService from '../../../services/vehicleService'
import type { Vehicle } from '../../../types/vehicle'

vi.mock('../../../services/vehicleService', () => ({
  default: { update: vi.fn() },
}))

vi.mock('../../../hooks/useCurrencyPreference', () => ({
  useCurrencyPreference: () => ({ currencyCode: 'USD', locale: 'en-US' }),
}))

const mockedUpdate = vi.mocked(vehicleService).update

const baseVehicle = {
  vin: 'TEST0000000000001',
  nickname: 'Test',
  usage_unit: 'distance',
  secondary_usage_enabled: false,
  standard_equipment: { items: ['ABS', 'Airbags'] },
  optional_equipment: { Comfort: ['Sunroof'], items: ['Tow package'] },
  window_sticker_options_detail: { 'Tow package': '1200' },
} as unknown as Vehicle

function renderDrawer(props: Partial<ComponentProps<typeof EquipmentDrawer>> = {}) {
  const onUpdated = vi.fn()
  const onClose = vi.fn()
  render(
    <EquipmentDrawer
      open
      onClose={onClose}
      vehicle={baseVehicle}
      vin="TEST0000000000001"
      which="standard"
      onUpdated={onUpdated}
      {...props}
    />,
  )
  return { onUpdated, onClose }
}

describe('EquipmentDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUpdate.mockResolvedValue(baseVehicle)
  })

  it('lists the standard items under the edit subtitle', () => {
    renderDrawer({ which: 'standard' })
    const dialog = screen.getByRole('dialog', { name: 'detail.standardEquipment' })
    expect(within(dialog).getByText('detail.equipment.editSubtitle')).toBeInTheDocument()
    expect(within(dialog).getByText('ABS')).toBeInTheDocument()
    expect(within(dialog).getByText('Airbags')).toBeInTheDocument()
  })

  it('preserves category headers and shows optional MSRP prices', () => {
    renderDrawer({ which: 'optional' })
    const dialog = screen.getByRole('dialog', { name: 'detail.optionalEquipment' })
    // A named category renders a header; the flat `items` bucket does not.
    expect(within(dialog).getByText('Comfort')).toBeInTheDocument()
    expect(within(dialog).getByText('Sunroof')).toBeInTheDocument()
    // Tow package carries a window-sticker price, shown read-only.
    expect(within(dialog).getByText('Tow package')).toBeInTheDocument()
    expect(within(dialog).getByText(/1,200/)).toBeInTheDocument()
  })

  it('adds an item to the flat bucket and saves via a partial PUT', async () => {
    const { onUpdated } = renderDrawer({ which: 'standard' })
    fireEvent.change(screen.getByPlaceholderText('detail.equipment.addPlaceholder'), {
      target: { value: 'Backup camera' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'detail.equipment.add' }))
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1))
    expect(mockedUpdate).toHaveBeenCalledWith('TEST0000000000001', {
      usage_unit: 'distance',
      secondary_usage_enabled: false,
      standard_equipment: { items: ['ABS', 'Airbags', 'Backup camera'] },
    })
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(baseVehicle))
  })

  it('removes the first item and saves the remaining list', async () => {
    renderDrawer({ which: 'standard' })
    // The remove buttons share an interpolated label (the test i18n mock drops
    // the {item}); the first belongs to the first row (ABS).
    fireEvent.click(screen.getAllByRole('button', { name: 'detail.equipment.remove' })[0])
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1))
    expect(mockedUpdate).toHaveBeenCalledWith('TEST0000000000001', {
      usage_unit: 'distance',
      secondary_usage_enabled: false,
      standard_equipment: { items: ['Airbags'] },
    })
  })

  it('Done closes without an extra save', () => {
    const { onClose } = renderDrawer({ which: 'standard' })
    fireEvent.click(screen.getByRole('button', { name: 'detail.equipment.done' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mockedUpdate).not.toHaveBeenCalled()
  })
})
