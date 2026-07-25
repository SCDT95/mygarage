import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react'
import type { FuelRecord } from '../../types/fuel'

// Query hooks + api mocked so this stays a unit test (no QueryClient/network).
const useFuelRecordsMock = vi.fn()
const useDeleteFuelRecordMock = vi.fn()
const useImportFuelCSVMock = vi.fn()
const apiGetMock = vi.fn()
const deleteMutate = vi.fn()

vi.mock('../../hooks/queries/useFuelRecords', () => ({
  useFuelRecords: () => useFuelRecordsMock(),
  useDeleteFuelRecord: () => useDeleteFuelRecordMock(),
  useImportFuelCSV: () => useImportFuelCSVMock(),
}))
vi.mock('../../services/api', () => ({ default: { get: (...a: unknown[]) => apiGetMock(...a) } }))
// Mutable so the unit-aware volume-header test (B7) can toggle metric/imperial;
// every other test leaves it at the metric default set in beforeEach.
const unitPrefMock = vi.hoisted(() => ({ system: 'metric' as 'metric' | 'imperial', showBoth: false }))
vi.mock('../../hooks/useUnitPreference', () => ({
  useUnitPreference: () => unitPrefMock,
}))
// LOCAL i18n mock (same pattern as the plan's DEF/Propane B5 fix — see
// task-3-review.md Important #1): the GLOBAL setup.ts mock is `t: (key) => key`,
// which discards interpolation args, so `t('fuelList.volumeUnit', { unit })` renders
// the identical string regardless of unit — a header test against it can't tell L
// from gal, or from a dropped {{unit}} entirely. This override retains `options.unit`
// for the volume-header assertions below and is otherwise behaviour-identical to the
// global mock (bare key, no unit) so the other 11 tests in this file stay green.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { unit?: string }) => (options?.unit ? `${key} (${options.unit})` : key),
    i18n: { language: 'en', changeLanguage: () => Promise.resolve() },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
// NOTE: the component imports formatCurrency from utils/formatUtils (NOT from this
// hook), so the REAL formatter runs: formatCurrency(43.75) → "$43.75" and
// formatCurrency(0) → "-" (NEVER "$0.00"). Assertions use the real output; the old
// plan's `getAllByText('$0.00')` was a dead assertion — that string is never rendered.
vi.mock('../../hooks/useCurrencyPreference', () => ({
  useCurrencyPreference: () => ({ currencyCode: 'USD', locale: 'en-US' }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import FuelRecordList from '../FuelRecordList'

const record: FuelRecord = {
  id: 1,
  vin: 'TEST12345678901234',
  date: '2026-03-01',
  odometer_km: '80467',
  liters: '47.318',
  propane_liters: null,
  price_per_unit: '0.925',
  price_basis: 'per_volume',
  cost: '43.75',
  l_per_100km: '7.200',        // DISTINCT from the tile average (8.5) → no ambiguous /8.5/ match
  is_full_tank: true,
  is_hauling: true,
  notes: 'topped off',
} as FuelRecord

const onAddClick = vi.fn()
const onEditClick = vi.fn()
const DEFAULT_PROPS = { vin: 'TEST12345678901234', onAddClick, onEditClick }

// The DataTable renders its caption as the table's accessible name, so this
// scopes every assertion to the row region — the whole point of B1/B2.
const table = () => screen.getByRole('table', { name: 'fuelList.tableCaption' })

beforeEach(() => {
  vi.clearAllMocks()
  unitPrefMock.system = 'metric'
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  useFuelRecordsMock.mockReturnValue({
    data: { records: [record], total: 1, average_l_per_100km: '8.5' },
    isLoading: false,
    error: null,
  })
  useDeleteFuelRecordMock.mockReturnValue({ mutate: deleteMutate, isPending: false, variables: undefined })
  useImportFuelCSVMock.mockReturnValue({ mutate: vi.fn(), isPending: false })
  apiGetMock.mockResolvedValue({ data: { fuel_type: 'gasoline' } })
})

describe('FuelRecordList — row cells scoped to the named table', () => {
  it('renders the row economy badge and the row cost INSIDE the table (fails if the economy or cost column is dropped; scoping stops a summary tile from satisfying it)', async () => {
    render(<FuelRecordList {...DEFAULT_PROPS} />)
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled())
    // real formatFuelEconomy(7.2,'metric') → "7.2 L/100km" — 7.2 appears only in the row badge
    expect(within(table()).getByText(/7\.2/)).toBeInTheDocument()
    // real formatCurrency(43.75) → "$43.75"; the Total-Spent tile also shows "$43.75"
    // but lives OUTSIDE the table, so scoping proves the row cost CELL renders.
    expect(within(table()).getByText(/43\.75/)).toBeInTheDocument()
  })

  it('uses the truthful generic price header, not a volume-only one (B8) (fails if the header reverts to a per-volume `fuelList.pricePerUnit`)', async () => {
    render(<FuelRecordList {...DEFAULT_PROPS} />)
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled())
    expect(within(table()).getByRole('columnheader', { name: 'fuelList.unitPrice' })).toBeInTheDocument()
    expect(within(table()).queryByRole('columnheader', { name: 'fuelList.pricePerUnit' })).not.toBeInTheDocument()
  })

  it('renders a per-WEIGHT row price under that SAME generic header (B8) (fails if the per-weight value is dropped or the header is basis-specific)', async () => {
    const perWeight = { ...record, id: 2, price_basis: 'per_weight', price_per_unit: '1.850' } as FuelRecord
    useFuelRecordsMock.mockReturnValue({ data: { records: [perWeight], total: 1, average_l_per_100km: '8.5' }, isLoading: false, error: null })
    render(<FuelRecordList {...DEFAULT_PROPS} />)
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled())
    // metric priceToDisplay(per_weight) passes the value through → formatCurrency(1.85) → "$1.85"
    expect(within(table()).getByText(/1\.85/)).toBeInTheDocument()
    expect(within(table()).getByRole('columnheader', { name: 'fuelList.unitPrice' })).toBeInTheDocument()
  })

  it('interpolates the SYSTEM volume unit into the header — L in metric, gal in imperial (fails if the impl omits {{unit}}, hardcodes one system, or reverts to a static key)', async () => {
    unitPrefMock.system = 'metric'
    const metric = render(<FuelRecordList {...DEFAULT_PROPS} />)
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled())
    expect(within(table()).getByRole('columnheader', { name: 'fuelList.volumeUnit (L)' })).toBeInTheDocument()
    metric.unmount()

    unitPrefMock.system = 'imperial'
    render(<FuelRecordList {...DEFAULT_PROPS} />)
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled())
    expect(within(table()).getByRole('columnheader', { name: 'fuelList.volumeUnit (gal)' })).toBeInTheDocument()
  })

  it('shows the Full-tank badge (true) and the towing badge (true) IN-table (fails if either status column is dropped)', async () => {
    render(<FuelRecordList {...DEFAULT_PROPS} />)
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled())
    expect(within(table()).getByText('fuelList.full')).toBeInTheDocument()
    expect(within(table()).getByText('fuelList.towing')).toBeInTheDocument()
  })

  it('renders the FALSE status states — partial badge + no towing badge (fails if the false branch is missing or swapped)', async () => {
    const plain = { ...record, is_full_tank: false, is_hauling: false } as FuelRecord
    useFuelRecordsMock.mockReturnValue({ data: { records: [plain], total: 1, average_l_per_100km: '8.5' }, isLoading: false, error: null })
    render(<FuelRecordList {...DEFAULT_PROPS} />)
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled())
    expect(within(table()).getByText('fuelList.partial')).toBeInTheDocument()
    expect(within(table()).queryByText('fuelList.full')).not.toBeInTheDocument()
    expect(within(table()).queryByText('fuelList.towing')).not.toBeInTheDocument()
  })
})

describe('FuelRecordList — row actions fire the real handlers', () => {
  it('clicking row Edit calls onEditClick with THE WHOLE record (fails if edit is unwired, passes the wrong row, or passes a truncated object)', async () => {
    render(<FuelRecordList {...DEFAULT_PROPS} />)
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled())
    fireEvent.click(within(table()).getByRole('button', { name: 'common:edit' }))
    // Contract is onEditClick(record: FuelRecord) (FuelRecordList.tsx:17); the render passes the
    // row object straight through (onClick={() => onEditClick(r)}), and rows are a filtered (not
    // mapped) view of the fixture, so assert the FULL record. objectContaining({ id }) would have
    // survived a truncated { id: 1 } that opened an edit form missing every other field.
    expect(onEditClick).toHaveBeenCalledWith(record)
  })

  it('clicking row Delete (confirm accepted) calls the delete mutation with the record id (fails if delete is unwired or the confirm gate is dropped)', async () => {
    render(<FuelRecordList {...DEFAULT_PROPS} />)
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled())
    fireEvent.click(within(table()).getByRole('button', { name: 'common:delete' }))
    expect(window.confirm).toHaveBeenCalled()
    expect(deleteMutate).toHaveBeenCalledWith(1, expect.anything())
  })

  it('exposes row edit + delete by accessible NAME (not title alone) (fails if IconButton loses aria-label)', async () => {
    render(<FuelRecordList {...DEFAULT_PROPS} />)
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled())
    expect(within(table()).getByRole('button', { name: 'common:edit' })).toBeInTheDocument()
    expect(within(table()).getByRole('button', { name: 'common:delete' })).toBeInTheDocument()
  })
})

describe('FuelRecordList — conditional propane column', () => {
  it('renders the propane column header ONLY for a propane vehicle (fails if the column is always- or never-shown)', async () => {
    apiGetMock.mockResolvedValue({ data: { fuel_type: 'propane' } })
    const propaneRec = { ...record, propane_liters: '39.750' } as FuelRecord
    useFuelRecordsMock.mockReturnValue({ data: { records: [propaneRec], total: 1, average_l_per_100km: null }, isLoading: false, error: null })
    render(<FuelRecordList {...DEFAULT_PROPS} />)
    // header appears only after the async vehicle fetch resolves → findByRole waits.
    // Also carries `{ unit }` (same as the volume header, B7) — the local i18n mock
    // now retains it, so the accessible name is the interpolated form (metric default: L).
    expect(await screen.findByRole('columnheader', { name: 'fuelList.propaneUnit (L)' })).toBeInTheDocument()
  })

  it('omits the propane column for a non-propane vehicle', async () => {
    render(<FuelRecordList {...DEFAULT_PROPS} />)
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled())
    // The real header renders interpolated (`fuelList.propaneUnit (L)` via the file-local
    // {{unit}}-retaining mock), so an exact `name: 'fuelList.propaneUnit'` never matches and
    // would pass even if a bug made the column always-on. Regex matches the interpolated form,
    // so this now FAILS if the propane column ever renders for a non-propane vehicle.
    expect(screen.queryByRole('columnheader', { name: /fuelList\.propaneUnit/ })).not.toBeInTheDocument()
  })
})

describe('FuelRecordList — empty state CTA is wired', () => {
  it('shows the "no records" empty state and its add-first CTA fires onAddClick (fails if the CTA is unwired or the title text changes)', () => {
    useFuelRecordsMock.mockReturnValue({ data: { records: [], total: 0, average_l_per_100km: null }, isLoading: false, error: null })
    render(<FuelRecordList {...DEFAULT_PROPS} />)
    expect(screen.getByText('fuelList.noRecords')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'fuelList.addFirstFillUp' }))
    expect(onAddClick).toHaveBeenCalled()
  })
})
