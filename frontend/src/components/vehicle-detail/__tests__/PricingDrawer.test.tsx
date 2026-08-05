import type { ComponentProps } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { render } from '../../../__tests__/test-utils'
import PricingDrawer from '../PricingDrawer'
import vehicleService from '../../../services/vehicleService'
import type { Vehicle } from '../../../types/vehicle'

vi.mock('../../../services/vehicleService', () => ({
  default: { update: vi.fn() },
}))

const mockedUpdate = vi.mocked(vehicleService).update

const baseVehicle = {
  vin: 'TEST0000000000001',
  nickname: 'Test',
  usage_unit: 'distance',
  secondary_usage_enabled: false,
  purchase_date: '2019-03-15',
  purchase_price: '15000.00',
  sold_date: null,
  sold_price: null,
  msrp_base: '40000.00',
  msrp_options: null,
  destination_charge: null,
  msrp_total: '44095.00',
} as unknown as Vehicle

function renderDrawer(props: Partial<ComponentProps<typeof PricingDrawer>> = {}) {
  const onUpdated = vi.fn()
  const onClose = vi.fn()
  render(
    <PricingDrawer
      open
      onClose={onClose}
      vehicle={baseVehicle}
      vin="TEST0000000000001"
      onUpdated={onUpdated}
      {...props}
    />,
  )
  return { onUpdated, onClose }
}

describe('PricingDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUpdate.mockResolvedValue(baseVehicle)
  })

  it('seeds the form from the vehicle pricing fields', () => {
    renderDrawer()
    expect(screen.getByLabelText('edit.purchaseDate')).toHaveValue('2019-03-15')
    expect(screen.getByLabelText('edit.purchasePrice')).toHaveValue(15000)
    expect(screen.getByLabelText('detail.misc.basePrice')).toHaveValue(40000)
    expect(screen.getByLabelText('detail.misc.totalMsrp')).toHaveValue(44095)
  })

  it('saves all pricing fields in one partial PUT, then closes', async () => {
    const { onUpdated, onClose } = renderDrawer()
    fireEvent.change(screen.getByLabelText('edit.purchasePrice'), { target: { value: '16000' } })
    fireEvent.change(screen.getByLabelText('detail.misc.options'), { target: { value: '2500' } })
    fireEvent.click(screen.getByRole('button', { name: 'common:save' }))

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1))
    expect(mockedUpdate).toHaveBeenCalledWith('TEST0000000000001', {
      purchase_date: '2019-03-15',
      purchase_price: '16000',
      sold_date: null,
      sold_price: null,
      msrp_base: '40000.00',
      msrp_options: '2500',
      destination_charge: null,
      msrp_total: '44095.00',
    })
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(baseVehicle))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('submits a cleared date as null, not an empty string', async () => {
    // PricingDrawer sends the whole pricing subset every save, mapping each
    // field through emptyToNull. An empty string here would fail Pydantic
    // date parsing; undefined would silently no-op under exclude_unset.
    renderDrawer()
    fireEvent.change(screen.getByLabelText('edit.purchaseDate'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'common:save' }))

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalled())
    const [, payload] = mockedUpdate.mock.calls[0]
    expect(payload.purchase_date).toBeNull()
  })
})
