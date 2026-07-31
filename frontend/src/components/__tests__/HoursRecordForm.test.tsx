import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { render } from '../../__tests__/test-utils'
import type { HoursRecord } from '../../types/hours'

const createMutateAsync = vi.fn().mockResolvedValue({})
const updateMutateAsync = vi.fn().mockResolvedValue({})
vi.mock('../../hooks/queries/useHoursRecords', () => ({
  useCreateHoursRecord: () => ({ mutateAsync: createMutateAsync }),
  useUpdateHoursRecord: () => ({ mutateAsync: updateMutateAsync }),
}))

import HoursRecordForm from '../HoursRecordForm'

beforeEach(() => vi.clearAllMocks())

describe('HoursRecordForm — routing + exact dimensionless payload', () => {
  it('create submits the COMPLETE payload (vin+date+engine_hours+notes) with NO unit conversion, and NEVER calls update (fails if any field is dropped, converted, or it misroutes)', async () => {
    render(<HoursRecordForm vin="V1" onClose={vi.fn()} onSuccess={vi.fn()} />)
    fireEvent.change(document.getElementById('date')!, { target: { value: '2026-03-01' } })
    fireEvent.change(document.getElementById('engine_hours')!, { target: { value: '812.4' } })
    fireEvent.click(screen.getByRole('button', { name: 'common:create' }))
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1))
    expect(createMutateAsync).toHaveBeenCalledWith({
      vin: 'V1',
      date: '2026-03-01',
      engine_hours: 812.4, // raw entered value — dimensionless, no conversion
      notes: '',
    })
    expect(updateMutateAsync).not.toHaveBeenCalled()
  })

  it('edit submits the COMPLETE update payload — routing id + the edited field + the raw engine_hours value — and NEVER calls create (fails if any field is dropped, converted, or it misroutes)', async () => {
    const record = {
      id: 7, vin: 'V1', date: '2026-01-01', engine_hours: '900.0', notes: '',
      source: 'manual', fuel_record_id: null, service_visit_id: null, created_at: '2026-01-01T00:00:00',
    } as unknown as HoursRecord
    render(<HoursRecordForm vin="V1" record={record} onClose={vi.fn()} onSuccess={vi.fn()} />)
    fireEvent.change(document.getElementById('date')!, { target: { value: '2026-04-01' } }) // change a field to observe it lands in the payload
    fireEvent.click(screen.getByRole('button', { name: 'common:update' }))
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1))
    // Seeded straight from the stored '900.0' — no unit round-trip, unlike odometer.
    expect(updateMutateAsync).toHaveBeenCalledWith({
      id: 7,
      vin: 'V1',
      date: '2026-04-01',
      engine_hours: 900,
      notes: '',
    })
    expect(createMutateAsync).not.toHaveBeenCalled()
  })

  it('preserves the #date and #engine_hours ids (fails if the Field/Input migration drops the id pass-through)', () => {
    render(<HoursRecordForm vin="V1" onClose={vi.fn()} onSuccess={vi.fn()} />)
    expect(document.getElementById('date')).toBeInTheDocument()
    expect(document.getElementById('engine_hours')).toBeInTheDocument()
  })
})
