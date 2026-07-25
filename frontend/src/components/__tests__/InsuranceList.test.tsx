import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/test-utils'
import { fireEvent } from '@testing-library/react'
import { formatCurrency } from '../../utils/formatUtils'
import type { InsurancePolicy } from '../../types/insurance'

const useInsuranceRecordsMock = vi.fn()
const deleteMutate = vi.fn()
vi.mock('../../hooks/queries/useInsuranceRecords', () => ({
  useInsuranceRecords: () => useInsuranceRecordsMock(),
  useDeleteInsuranceRecord: () => ({ mutate: deleteMutate, isPending: false, variables: undefined }),
}))
vi.mock('../../hooks/useCurrencyPreference', () => ({ useCurrencyPreference: () => ({ currencyCode: 'USD', locale: 'en-US', formatCurrency: vi.fn() }) }))
vi.mock('../../hooks/useDateLocale', () => ({ useDateLocale: () => undefined }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import InsuranceList from '../InsuranceList'

const activePolicy = {
  id: 1, provider: 'Geico', policy_type: 'Liability', policy_number: 'POL-1',
  start_date: '2020-01-01', end_date: '2099-12-31',
  premium_amount: '120.00', deductible: '500',
  coverage_limits: '', notes: '',
} as unknown as InsurancePolicy
const expiredPolicy = { ...activePolicy, id: 2, end_date: '2000-01-01' } as unknown as InsurancePolicy

const onAddClick = vi.fn()
const onEditClick = vi.fn()
const PROPS = { vin: 'V1', onAddClick, onEditClick }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  useInsuranceRecordsMock.mockReturnValue({ data: [activePolicy], isLoading: false, error: null })
})

describe('InsuranceList — rendering + row actions', () => {
  it('renders the provider + BOTH currency figures via the REAL formatCurrency — premium AND deductible (fails if either currency Mono is dropped or renders unformatted)', () => {
    render(<InsuranceList {...PROPS} />)
    expect(screen.getByText('Geico')).toBeInTheDocument()
    // M2 (FRESH-1): both premium AND deductible are load-bearing display conversions asserted via the
    // REAL formatter — never a hard-coded literal or an unanchored regex. The fixture carries NO
    // premium_frequency, so the premium node's direct text is EXACTLY formatCurrency('120.00', …) both
    // today (a plain <p>: `{formatCurrency(...)}` with the ` / freq` suffix absent) AND after the
    // restyle (a <Mono> span) — a true formatter characterization, GREEN both ways and sabotage-provable
    // by breaking the formatCurrency call. deductible is a standalone figure. DISTINCT values
    // ($120.00 vs $500.00) so neither cell cross-matches.
    expect(screen.getByText(formatCurrency('120.00', { currencyCode: 'USD', locale: 'en-US' }))).toBeInTheDocument()
    expect(screen.getByText(formatCurrency('500', { currencyCode: 'USD', locale: 'en-US' }))).toBeInTheDocument()
  })

  it('clicking row Edit calls onEditClick with THE WHOLE policy (fails if edit is unwired, passes the wrong row, or a truncated object)', () => {
    render(<InsuranceList {...PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: 'common:edit' }))
    expect(onEditClick).toHaveBeenCalledWith(activePolicy)
  })

  it('clicking row Delete (confirm accepted) calls the delete mutation with the policy id (fails if delete is unwired or the confirm gate is dropped)', () => {
    render(<InsuranceList {...PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: 'common:delete' }))
    expect(window.confirm).toHaveBeenCalled()
    expect(deleteMutate).toHaveBeenCalledWith(1, expect.anything())
  })

  it('the row Edit/Delete expose a real aria-label (IconButton), not a bare title (fails if IconButton regresses to a title-only <button>)', () => {
    render(<InsuranceList {...PROPS} />)
    expect(screen.getByRole('button', { name: 'common:edit' })).toHaveAttribute('aria-label', 'common:edit')
    expect(screen.getByRole('button', { name: 'common:delete' })).toHaveAttribute('aria-label', 'common:delete')
  })
})

describe('InsuranceList — expired status (both ways) + empty state', () => {
  it('an expired policy shows the Expired label (fails if the expired flag stops rendering)', () => {
    useInsuranceRecordsMock.mockReturnValue({ data: [expiredPolicy], isLoading: false, error: null })
    render(<InsuranceList {...PROPS} />)
    expect(screen.getByText('insuranceList.expired')).toBeInTheDocument()
  })

  it('an active policy does NOT show the Expired label (fails if isExpired is inverted or always-on)', () => {
    render(<InsuranceList {...PROPS} />)
    expect(screen.queryByText('insuranceList.expired')).not.toBeInTheDocument()
  })

  it('with zero policies, the empty-state CTA fires onAddClick (fails if the CTA is unwired or the title text changes)', () => {
    useInsuranceRecordsMock.mockReturnValue({ data: [], isLoading: false, error: null })
    render(<InsuranceList {...PROPS} />)
    expect(screen.getByText('insuranceList.noRecords')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'insuranceList.addFirstPolicy' }))
    expect(onAddClick).toHaveBeenCalled()
  })
})
