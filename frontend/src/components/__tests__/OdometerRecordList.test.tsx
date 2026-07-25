import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { UnitFormatter } from '../../utils/units'
import type { OdometerRecord } from '../../types/odometer'

const useOdometerRecordsMock = vi.fn()
const deleteMutate = vi.fn()

vi.mock('../../hooks/queries/useOdometerRecords', () => ({
  useOdometerRecords: () => useOdometerRecordsMock(),
  useDeleteOdometerRecord: () => ({ mutate: deleteMutate, isPending: false, variables: undefined }),
  useImportOdometerCSV: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }))
vi.mock('../../hooks/useUnitPreference', () => ({ useUnitPreference: () => ({ system: 'metric', showBoth: false }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import OdometerRecordList from '../OdometerRecordList'

const record = { id: 1, vin: 'V1', date: '2026-03-01', odometer_km: '80467', notes: 'road trip' } as unknown as OdometerRecord
const livelink = { id: 2, vin: 'V1', date: '2026-03-02', odometer_km: '80500', notes: null, source: 'livelink' } as unknown as OdometerRecord
const onAddClick = vi.fn()
const onEditClick = vi.fn()
const PROPS = { vin: 'V1', onAddClick, onEditClick }
const table = () => screen.getByRole('table', { name: 'odometerList.tableCaption' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  // latest (80500) is deliberately DISTINCT from the single row (80467) so the hero
  // test proves the hero binds to latest_odometer_km, not to a row value.
  useOdometerRecordsMock.mockReturnValue({ data: { records: [record], latest_odometer_km: '80500' }, isLoading: false, error: null })
})

describe('OdometerRecordList — DataTable rows scoped to the named table', () => {
  it('renders the mileage cell INSIDE the named table and the unit-aware header (fails if the DataTable/caption is dropped or the mileage column vanishes; scoping stops the hero tile from satisfying it)', () => {
    render(<OdometerRecordList {...PROPS} />)
    // real formatDistance(80467,'metric') → "80,467 km" — the row value; the hero shows
    // the DISTINCT latest (80500) and lives OUTSIDE the table, so within(table()) proves
    // the row CELL renders (scoping stops the hero tile from satisfying it).
    expect(within(table()).getByText(UnitFormatter.formatDistance(80467, 'metric', false))).toBeInTheDocument()
    // The header uses the unit-aware KEY (not a hardcoded "Mileage (km)" literal).
    expect(within(table()).getByRole('columnheader', { name: 'odometerRecordList.mileageColumn' })).toBeInTheDocument()
  })

  it('renders the EXACT latest-mileage value inside the hero card, and the hero lives OUTSIDE the table (fails if the hero value is dropped, wrong, unformatted, or leaks into the table)', () => {
    render(<OdometerRecordList {...PROPS} />)
    // The hero label <p> and its <Mono size="2xl"> value are siblings in one <div>;
    // scope to that container and assert the exact formatted LATEST (80500 ≠ the row's
    // 80467), proving the hero shows the latest value, not merely that a label exists.
    const hero = screen.getByText('odometerList.latestMileage').parentElement as HTMLElement
    expect(within(hero).getByText(UnitFormatter.formatDistance(80500, 'metric', false))).toBeInTheDocument()
    // and the hero label never appears inside the table.
    expect(within(table()).queryByText('odometerList.latestMileage')).not.toBeInTheDocument()
  })
})

describe('OdometerRecordList — LiveLink source badge', () => {
  it('renders the info badge on the livelink row and NOT on the ordinary row (fails if the badge is always-/never-shown, sits on the wrong row, or loses its accessible text)', () => {
    useOdometerRecordsMock.mockReturnValue({ data: { records: [record, livelink], latest_odometer_km: '80500' }, isLoading: false, error: null })
    render(<OdometerRecordList {...PROPS} />)
    // Identify each row by content unique to it: the ordinary row by its notes,
    // the livelink row by its distinct mileage (80500, scoped inside the table so the
    // hero's 80500 does not interfere).
    const ordinaryRow = within(table()).getByText('road trip').closest('tr') as HTMLElement
    const livelinkRow = within(table()).getByText(UnitFormatter.formatDistance(80500, 'metric', false)).closest('tr') as HTMLElement
    expect(within(livelinkRow).getByText('odometerRecordList.autoTrackedByLiveLink')).toBeInTheDocument()
    expect(within(ordinaryRow).queryByText('odometerRecordList.autoTrackedByLiveLink')).not.toBeInTheDocument()
  })
})

describe('OdometerRecordList — row actions + empty state', () => {
  it('clicking row Edit calls onEditClick with THE WHOLE record (fails if edit is unwired or passes a truncated object)', () => {
    render(<OdometerRecordList {...PROPS} />)
    fireEvent.click(within(table()).getByRole('button', { name: 'common:edit' }))
    expect(onEditClick).toHaveBeenCalledWith(record)
  })

  it('clicking row Delete (confirm accepted) calls the delete mutation with the record id (fails if delete is unwired or the confirm gate is dropped)', () => {
    render(<OdometerRecordList {...PROPS} />)
    fireEvent.click(within(table()).getByRole('button', { name: 'common:delete' }))
    expect(window.confirm).toHaveBeenCalled()
    expect(deleteMutate).toHaveBeenCalledWith(1, expect.anything())
  })

  it('with zero records, the empty-state CTA fires onAddClick (fails if the CTA is unwired or the title text changes)', () => {
    useOdometerRecordsMock.mockReturnValue({ data: { records: [], latest_odometer_km: null }, isLoading: false, error: null })
    render(<OdometerRecordList {...PROPS} />)
    expect(screen.getByText('odometerList.noRecords')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'odometerList.addFirstReading' }))
    expect(onAddClick).toHaveBeenCalled()
  })
})
