import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { render } from '../../__tests__/test-utils'

const createMock = vi.fn().mockResolvedValue({})
const updateMock = vi.fn().mockResolvedValue({})

vi.mock('../../hooks/queries/usePropaneRecords', () => ({
  useCreatePropaneRecord: () => ({ mutateAsync: createMock }),
  useUpdatePropaneRecord: () => ({ mutateAsync: updateMock }),
}))
vi.mock('../../hooks/useUnitPreference', () => ({ useUnitPreference: () => ({ system: 'metric' }) }))
vi.mock('../../hooks/useCurrencySymbol', () => ({ useCurrencySymbol: () => '$' }))

import PropaneRecordForm from '../PropaneRecordForm'

const DEFAULT_PROPS = { vin: 'TEST12345678901234', onClose: vi.fn(), onSuccess: vi.fn() }
const propaneForm = () => document.getElementById('propane-record-form') as HTMLFormElement

beforeEach(() => vi.clearAllMocks())

describe('PropaneRecordForm — structure', () => {
  it('renders every field control by id (fails if the restyle drops a field)', () => {
    render(<PropaneRecordForm {...DEFAULT_PROPS} />)
    for (const id of ['date', 'tank_size_kg', 'tank_quantity', 'propane_liters', 'price_per_unit', 'cost', 'vendor', 'notes']) {
      expect(document.getElementById(id), id).not.toBeNull()
    }
  })

  it('keeps tank_size a NATIVE <select> with a placeholder + one option per TANK_SIZES entry AND the canonical-kg option values (fails if it becomes a custom combobox, loses options, or renumbers the values)', () => {
    render(<PropaneRecordForm {...DEFAULT_PROPS} />)
    const select = document.getElementById('tank_size_kg') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect(select.options.length).toBe(5)              // 4 TANK_SIZES + 1 empty placeholder
    expect(select.options[0].value).toBe('')            // placeholder
    // metric option values ARE the canonical kg weights (imperial would be rounded lbs)
    expect(Array.from(select.options).slice(1).map((o) => o.value)).toEqual(['9.07', '14.97', '45.36', '190.51'])
  })

  it('the footer submit button is wired via form= association (fails if it becomes an onClick button)', () => {
    render(<PropaneRecordForm {...DEFAULT_PROPS} />)
    const create = screen.getByRole('button', { name: 'common:create' })
    expect(create).toHaveAttribute('type', 'submit')
    expect(create).toHaveAttribute('form', 'propane-record-form')
  })
})

describe('PropaneRecordForm — tank auto-calc + submit wiring', () => {
  it('selecting a tank size + quantity auto-calculates the propane volume into #propane_liters (fails if the calc effect is unwired)', async () => {
    render(<PropaneRecordForm {...DEFAULT_PROPS} />)
    fireEvent.change(document.getElementById('tank_size_kg') as HTMLSelectElement, { target: { value: '9.07' } })
    fireEvent.change(document.getElementById('tank_quantity') as HTMLInputElement, { target: { value: '2' } })
    // 9.07 kg × 2 × 1.968 L/kg = 35.699… → toFixed(3) → 35.7 (metric: no gallon conversion)
    await waitFor(() => expect((document.getElementById('propane_liters') as HTMLInputElement).value).toBe('35.7'))
  })

  it('CREATE: submit sends a CANONICAL payload with price_basis="per_volume" ALWAYS (fails if submit is unwired, values are not canonicalized, or the basis regresses to per_tank)', async () => {
    render(<PropaneRecordForm {...DEFAULT_PROPS} />)
    fireEvent.change(document.getElementById('date') as HTMLInputElement, { target: { value: '2026-03-01' } })
    fireEvent.change(document.getElementById('tank_size_kg') as HTMLSelectElement, { target: { value: '9.07' } })
    fireEvent.change(document.getElementById('tank_quantity') as HTMLInputElement, { target: { value: '2' } })
    await waitFor(() => expect((document.getElementById('propane_liters') as HTMLInputElement).value).toBe('35.7'))
    fireEvent.submit(propaneForm())
    await waitFor(() => expect(createMock).toHaveBeenCalled())
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      vin: 'TEST12345678901234', date: '2026-03-01',
      price_basis: 'per_volume', tank_size_kg: 9.07, tank_quantity: 2, propane_liters: 35.7,
    }))
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('EDIT: submit calls the UPDATE mutation (not create) with the record id + the canonical payload (fails if edit routes to create OR loses vin/date/propane_liters/price_basis)', async () => {
    render(<PropaneRecordForm {...DEFAULT_PROPS} record={{ id: 9, vin: DEFAULT_PROPS.vin, date: '2026-03-01', propane_liters: '39.750' } as never} />)
    fireEvent.submit(propaneForm())
    await waitFor(() => expect(updateMock).toHaveBeenCalled())
    // onSubmit builds { id, ...payload } (PropaneRecordForm.tsx:167-186) and useUpdatePropaneRecord
    // strips id before the API call (usePropaneRecords.ts:40). Metric mode: toCanonicalLiters is
    // identity, so propane_liters '39.750' → 39.75; price_basis is ALWAYS 'per_volume'.
    // objectContaining({ id }) alone would survive losing vin/date/propane_liters/price_basis.
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 9,
      vin: DEFAULT_PROPS.vin,
      date: '2026-03-01',
      propane_liters: 39.75,
      price_basis: 'per_volume',
    }))
    expect(createMock).not.toHaveBeenCalled()
  })
})
