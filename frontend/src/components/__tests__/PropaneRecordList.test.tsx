import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import type { FuelRecord } from '../../types/fuel'

const usePropaneRecordsMock = vi.fn()
const useDeletePropaneRecordMock = vi.fn()
const deleteMutate = vi.fn()

vi.mock('../../hooks/queries/usePropaneRecords', () => ({
  usePropaneRecords: () => usePropaneRecordsMock(),
  useDeletePropaneRecord: () => useDeletePropaneRecordMock(),
  useCreatePropaneRecord: () => ({ mutateAsync: vi.fn() }),
  useUpdatePropaneRecord: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
// Mutable unit mock so one test can render imperial (B7 header coverage).
const unitPrefMock = vi.hoisted(() => ({ system: 'metric' as 'metric' | 'imperial', showBoth: false }))
vi.mock('../../hooks/useUnitPreference', () => ({ useUnitPreference: () => unitPrefMock }))
// LOCAL i18n mock (B5) — overrides the global setup mock FOR THIS FILE ONLY. For a `{ unit }`
// call it appends the unit so the volume header reflects {{unit}} (the only way this file can
// tell L from gal — the global mock swallows interpolation); every other call returns the bare
// key, so the drawer-title / vendor / action assertions below are unaffected.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { unit?: string }) => (options?.unit ? `${key} (${options.unit})` : key),
    i18n: { language: 'en', changeLanguage: () => Promise.resolve() },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('../../hooks/useCurrencyPreference', () => ({
  useCurrencyPreference: () => ({ currencyCode: 'USD', locale: 'en-US' }),
}))
// PropaneRecordForm (rendered on Add/Edit) → CurrencyInputPrefix → useCurrencySymbol.
vi.mock('../../hooks/useCurrencySymbol', () => ({ useCurrencySymbol: () => '$' }))

import PropaneRecordList from '../PropaneRecordList'

// NOTE: the component imports formatCurrency from utils/formatUtils (NOT the currency
// hook), so the REAL formatter runs — formatCurrency(30.44) → "$30.44", never "$0.00".
const record = {
  id: 1,
  vin: 'TEST12345678901234',
  date: '2026-03-01',
  propane_liters: '39.750',
  price_per_unit: '0.766',
  price_basis: 'per_volume',
  cost: '30.44',
  notes: 'Vendor: AmeriGas\nfull tank',
} as FuelRecord

const table = () => screen.getByRole('table', { name: 'propaneList.tableCaption' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  usePropaneRecordsMock.mockReturnValue({ data: { records: [record] }, isLoading: false, error: null })
  useDeletePropaneRecordMock.mockReturnValue({ mutate: deleteMutate, isPending: false, variables: undefined })
})
afterEach(() => { unitPrefMock.system = 'metric' })

describe('PropaneRecordList — DataTable rows scoped to the named table', () => {
  it('renders the row vendor (parsed from notes) and the row cost INSIDE the table (fails if the vendor or cost column is dropped; scoping stops the Total-Spent tile from satisfying the cost check)', () => {
    render(<PropaneRecordList vin="TEST12345678901234" />)
    expect(within(table()).getByText('AmeriGas')).toBeInTheDocument()
    // formatCurrency(30.44) → "$30.44"; the Total-Spent tile shows it too but lives OUTSIDE the table.
    expect(within(table()).getByText(/30\.44/)).toBeInTheDocument()
  })

  it('interpolates the SYSTEM volume unit into the header — L in metric, gal in imperial (B7) (fails if the impl omits {{unit}}, hardcodes gal for both, or reverts to the static `propaneList.gallons` key)', () => {
    // The local i18n mock retains {{unit}}; getVolumeUnit → 'L' (metric) / 'gal' (imperial).
    unitPrefMock.system = 'metric'
    const metric = render(<PropaneRecordList vin="TEST12345678901234" />)
    expect(within(table()).getByRole('columnheader', { name: 'propaneList.volumeUnit (L)' })).toBeInTheDocument()
    expect(within(table()).queryByRole('columnheader', { name: 'propaneList.gallons' })).not.toBeInTheDocument()
    metric.unmount()
    unitPrefMock.system = 'imperial'
    render(<PropaneRecordList vin="TEST12345678901234" />)
    expect(within(table()).getByRole('columnheader', { name: 'propaneList.volumeUnit (gal)' })).toBeInTheDocument()
  })
})

describe('PropaneRecordList — actions open the right form + fire the mutation', () => {
  it('clicking the header Add opens the CREATE drawer (fails if Add is unwired or opens edit)', () => {
    render(<PropaneRecordList vin="TEST12345678901234" />)
    fireEvent.click(screen.getByRole('button', { name: 'propaneList.addPropane' }))
    expect(screen.getByText('propane.createTitle')).toBeInTheDocument()
    expect(screen.queryByText('propane.editTitle')).not.toBeInTheDocument()
  })

  it('clicking a row Edit opens the EDIT drawer (fails if edit is unwired or opens create)', () => {
    render(<PropaneRecordList vin="TEST12345678901234" />)
    fireEvent.click(within(table()).getByRole('button', { name: 'common:edit' }))
    expect(screen.getByText('propane.editTitle')).toBeInTheDocument()
    expect(screen.queryByText('propane.createTitle')).not.toBeInTheDocument()
  })

  it('clicking a row Delete (confirm accepted) calls the delete mutation with THAT record id (fails if delete is unwired or the confirm gate is dropped)', () => {
    render(<PropaneRecordList vin="TEST12345678901234" />)
    fireEvent.click(within(table()).getByRole('button', { name: 'common:delete' }))
    expect(window.confirm).toHaveBeenCalled()
    expect(deleteMutate).toHaveBeenCalledWith(1, expect.anything())
  })
})

describe('PropaneRecordList — empty state CTA is wired', () => {
  it('shows the empty state and its add-first CTA opens the CREATE drawer (fails if the CTA is unwired or the title text changes)', () => {
    usePropaneRecordsMock.mockReturnValue({ data: { records: [] }, isLoading: false, error: null })
    render(<PropaneRecordList vin="TEST12345678901234" />)
    expect(screen.getByText('propaneList.noRecords')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'propaneList.addFirstRecord' }))
    expect(screen.getByText('propane.createTitle')).toBeInTheDocument()
  })
})
