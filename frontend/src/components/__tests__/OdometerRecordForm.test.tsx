import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { render } from '../../__tests__/test-utils'
import { toCanonicalKm } from '../../utils/decimalSafe'
import { UnitConverter } from '../../utils/units'
import type { OdometerRecord } from '../../types/odometer'

const createMutateAsync = vi.fn().mockResolvedValue({})
const updateMutateAsync = vi.fn().mockResolvedValue({})
vi.mock('../../hooks/queries/useOdometerRecords', () => ({
  useCreateOdometerRecord: () => ({ mutateAsync: createMutateAsync }),
  useUpdateOdometerRecord: () => ({ mutateAsync: updateMutateAsync }),
}))
vi.mock('../../hooks/useUnitPreference', () => ({ useUnitPreference: () => ({ system: 'imperial', showBoth: false }) }))

import OdometerRecordForm from '../OdometerRecordForm'

beforeEach(() => vi.clearAllMocks())

describe('OdometerRecordForm — routing + canonical conversion + exact payload', () => {
  it('create submits the COMPLETE canonical payload (vin+date+km+notes), converting miles→km, and NEVER calls update (fails if any field is dropped, the raw display value is stored, or it misroutes)', async () => {
    render(<OdometerRecordForm vin="V1" onClose={vi.fn()} onSuccess={vi.fn()} />)
    fireEvent.change(document.getElementById('date')!, { target: { value: '2026-03-01' } })
    fireEvent.change(document.getElementById('odometer_km')!, { target: { value: '50000' } })
    fireEvent.click(screen.getByRole('button', { name: 'common:create' }))
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1))
    const expectedKm = toCanonicalKm(50000, 'imperial')! // ~80467 km, NOT the raw 50000
    expect(createMutateAsync).toHaveBeenCalledWith({
      vin: 'V1',
      date: '2026-03-01',
      odometer_km: expect.closeTo(expectedKm, 2),
      notes: '',
    })
    expect(updateMutateAsync).not.toHaveBeenCalled()
  })

  it('edit submits the COMPLETE update payload — routing id + the edited field + canonical km — and NEVER calls create (fails if any field is dropped or it misroutes)', async () => {
    const record = { id: 7, vin: 'V1', date: '2026-01-01', odometer_km: '80467', notes: '' } as unknown as OdometerRecord
    render(<OdometerRecordForm vin="V1" record={record} onClose={vi.fn()} onSuccess={vi.fn()} />)
    fireEvent.change(document.getElementById('date')!, { target: { value: '2026-04-01' } }) // change a field to observe it lands in the payload
    fireEvent.click(screen.getByRole('button', { name: 'common:update' }))
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1))
    // The edit seeds km from the stored 80467 km, shown in miles (imperial) and
    // converted back on submit — assert the SAME round-trip the code performs.
    const expectedKm = toCanonicalKm(UnitConverter.kmToMiles(80467)!, 'imperial')!
    expect(updateMutateAsync).toHaveBeenCalledWith({
      id: 7,
      vin: 'V1',
      date: '2026-04-01',
      odometer_km: expect.closeTo(expectedKm, 2),
      notes: '',
    })
    expect(createMutateAsync).not.toHaveBeenCalled()
  })

  it('preserves the #date and #odometer_km ids (fails if the Field/Input migration drops the id pass-through)', () => {
    render(<OdometerRecordForm vin="V1" onClose={vi.fn()} onSuccess={vi.fn()} />)
    expect(document.getElementById('date')).toBeInTheDocument()
    expect(document.getElementById('odometer_km')).toBeInTheDocument()
  })
})
