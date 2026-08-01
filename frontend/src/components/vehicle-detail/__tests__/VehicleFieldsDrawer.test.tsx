import type { ComponentProps } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { render } from '../../../__tests__/test-utils'
import VehicleFieldsDrawer from '../VehicleFieldsDrawer'
import vehicleService from '../../../services/vehicleService'
import type { Vehicle } from '../../../types/vehicle'

vi.mock('../../../services/vehicleService', () => ({
  default: { update: vi.fn() },
}))

const mockedUpdate = vi.mocked(vehicleService).update

const baseVehicle = {
  vin: 'TEST0000000000001',
  nickname: 'Test',
  year: 2019,
  make: 'Mitsubishi',
  model: 'Mirage',
  license_plate: 'ABC-1234',
  color: 'Red',
  exterior_color: null,
  interior_color: 'Black',
  warranty_basic: '3 yr / 36,000 mi',
  warranty_powertrain: null,
} as unknown as Vehicle

function renderDrawer(props: Partial<ComponentProps<typeof VehicleFieldsDrawer>> = {}) {
  const onUpdated = vi.fn()
  const onClose = vi.fn()
  render(
    <VehicleFieldsDrawer
      open
      onClose={onClose}
      vehicle={baseVehicle}
      vin="TEST0000000000001"
      card="basic"
      isMotorized
      onUpdated={onUpdated}
      {...props}
    />,
  )
  return { onUpdated, onClose }
}

describe('VehicleFieldsDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUpdate.mockResolvedValue(baseVehicle)
  })

  it('seeds the Basic Information fields, with exterior color falling back to color', () => {
    renderDrawer({ card: 'basic' })
    expect(screen.getByLabelText('edit.year')).toHaveValue(2019)
    expect(screen.getByLabelText('edit.make')).toHaveValue('Mitsubishi')
    // exterior_color is null, so the field seeds from the legacy `color`.
    expect(screen.getByLabelText('detail.misc.exteriorColor')).toHaveValue('Red')
    expect(screen.getByLabelText('detail.misc.interiorColor')).toHaveValue('Black')
  })

  it('saves ONLY the changed fields (dirty-diff), coercing numbers, then closes', async () => {
    const { onUpdated, onClose } = renderDrawer({ card: 'basic' })
    fireEvent.change(screen.getByLabelText('edit.year'), { target: { value: '2020' } })
    fireEvent.change(screen.getByLabelText('detail.misc.exteriorColor'), { target: { value: 'Blue' } })
    fireEvent.click(screen.getByRole('button', { name: 'common:save' }))

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1))
    // Only year + exterior color were touched — the untouched fields are omitted.
    expect(mockedUpdate).toHaveBeenCalledWith('TEST0000000000001', {
      year: 2020,
      exterior_color: 'Blue',
    })
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(baseVehicle))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('does NOT write exterior_color when an unrelated field is edited (color masking guard)', async () => {
    // baseVehicle has exterior_color=null, color='Red'. The exterior-color field
    // seeds from `color`, but an untouched save must not promote it into
    // exterior_color (which would mask `color` under the display precedence).
    renderDrawer({ card: 'basic' })
    fireEvent.change(screen.getByLabelText('edit.licensePlate'), { target: { value: 'ZZZ-9999' } })
    fireEvent.click(screen.getByRole('button', { name: 'common:save' }))
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('TEST0000000000001', { license_plate: 'ZZZ-9999' }),
    )
  })

  it('sends null for a cleared field, and omits the untouched sibling (Warranty card)', async () => {
    renderDrawer({ card: 'warranty' })
    expect(screen.getByLabelText('detail.misc.basic')).toHaveValue('3 yr / 36,000 mi')
    fireEvent.change(screen.getByLabelText('detail.misc.basic'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'common:save' }))
    // warranty_powertrain was already empty and untouched → omitted.
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('TEST0000000000001', { warranty_basic: null }),
    )
  })

  it('closes without a PUT when nothing changed', () => {
    const { onClose } = renderDrawer({ card: 'basic' })
    fireEvent.click(screen.getByRole('button', { name: 'common:save' }))
    expect(mockedUpdate).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
