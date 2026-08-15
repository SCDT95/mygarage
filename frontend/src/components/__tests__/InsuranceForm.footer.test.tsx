import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../../__tests__/test-utils'
import type { InsurancePolicy } from '../../types/insurance'

const createMutateAsync = vi.fn().mockResolvedValue({})
const updateMutateAsync = vi.fn().mockResolvedValue({})
vi.mock('../../hooks/queries/useInsuranceRecords', () => ({
  useCreateInsuranceRecord: () => ({ mutateAsync: createMutateAsync }),
  useUpdateInsuranceRecord: () => ({ mutateAsync: updateMutateAsync }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import InsuranceForm from '../InsuranceForm'

beforeEach(() => vi.clearAllMocks())

// M1: fill via the LABEL→control association (getByLabelText) with async userEvent — realistic
// typing/selection, never fireEvent.change and never document.getElementById. The i18n mock echoes
// keys, so Field renders these exact accessible names (label + ' *' on the five required fields) —
// identical to the current raw-label markup pre-restyle (verified).
const fillCreate = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.clear(screen.getByLabelText('insurance.provider *'))
  await user.type(screen.getByLabelText('insurance.provider *'), 'Geico')
  await user.clear(screen.getByLabelText('insurance.policyNumber *'))
  await user.type(screen.getByLabelText('insurance.policyNumber *'), 'POL-1')
  await user.selectOptions(screen.getByLabelText('insurance.policyType *'), 'Liability')
  await user.clear(screen.getByLabelText('common:startDate *'))
  await user.type(screen.getByLabelText('common:startDate *'), '2026-01-01')
  await user.clear(screen.getByLabelText('common:endDate *'))
  await user.type(screen.getByLabelText('common:endDate *'), '2026-12-31')
  await user.clear(screen.getByLabelText('insurance.premiumAmount'))
  await user.type(screen.getByLabelText('insurance.premiumAmount'), '120.00')
  await user.selectOptions(screen.getByLabelText('insurance.premiumFrequency'), 'Monthly')
  await user.clear(screen.getByLabelText('insurance.deductible'))
  await user.type(screen.getByLabelText('insurance.deductible'), '500')
  await user.clear(screen.getByLabelText('insurance.coverageLimits'))
  await user.type(screen.getByLabelText('insurance.coverageLimits'), '100/300')
  await user.clear(screen.getByLabelText('common:notes'))
  await user.type(screen.getByLabelText('common:notes'), 'note')
}

describe('InsuranceForm — footer submit association (coupled contract, keep green)', () => {
  it('clicking the footer Save (outside the <form>) triggers the form submit; empty required fields surface the validation error and no mutation fires', async () => {
    const user = userEvent.setup()
    render(<InsuranceForm vin="TEST12345678901234" onClose={vi.fn()} onSuccess={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'common:create' }))
    // The i18n mock echoes keys; provider's required message is now
    // translated via t('common:validation.provider.required') instead of a
    // hardcoded English string.
    expect(await screen.findByText('common:validation.provider.required')).toBeInTheDocument()
    expect(createMutateAsync).not.toHaveBeenCalled()
  })
})

describe('InsuranceForm — routing + exact payload (SDQ-C)', () => {
  it('create submits the COMPLETE 10-field payload and NEVER calls update (fails if a field is dropped or it misroutes)', async () => {
    const user = userEvent.setup()
    render(<InsuranceForm vin="V1" onClose={vi.fn()} onSuccess={vi.fn()} />)
    await fillCreate(user)
    await user.click(screen.getByRole('button', { name: 'common:create' }))
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1))
    expect(createMutateAsync).toHaveBeenCalledWith({
      provider: 'Geico',
      policy_number: 'POL-1',
      policy_type: 'Liability',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      // premium_amount/deductible are numbers now — registerDecimal parses
      // the typed text via the locale-aware decimal reader, and the schema's
      // output type is `number | undefined`, not the raw string.
      premium_amount: 120,
      premium_frequency: 'Monthly',
      deductible: 500,
      coverage_limits: '100/300',
      notes: 'note',
    })
    expect(updateMutateAsync).not.toHaveBeenCalled()
  })

  it('edit submits the UPDATE payload with routing id + the edited field and NEVER calls create (fails if it misroutes or drops the id)', async () => {
    const record = {
      id: 3, provider: 'State Farm', policy_number: 'SF-1', policy_type: 'Comprehensive',
      start_date: '2025-01-01', end_date: '2025-12-31',
      premium_amount: '90', premium_frequency: 'Monthly', deductible: '250',
      coverage_limits: '50/100', notes: '',
    } as unknown as InsurancePolicy
    const user = userEvent.setup()
    render(<InsuranceForm vin="V1" record={record} onClose={vi.fn()} onSuccess={vi.fn()} />)
    await user.clear(screen.getByLabelText('insurance.provider *'))
    await user.type(screen.getByLabelText('insurance.provider *'), 'State Farm Ins')
    await user.click(screen.getByRole('button', { name: 'common:update' }))
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1))
    // B2/LD4: assert the COMPLETE 11-property update object (id + all 10 body fields), not a
    // partial objectContaining — dropping any of the other 8 fields must FAIL the test.
    expect(updateMutateAsync).toHaveBeenCalledWith({
      id: 3,
      provider: 'State Farm Ins',
      policy_number: 'SF-1',
      policy_type: 'Comprehensive',
      start_date: '2025-01-01',
      end_date: '2025-12-31',
      // premium_amount/deductible are numbers now (see the create-payload
      // test above). notes is null, not '' — the payload rule sends null,
      // never '', for a cleared optional field; the record's stored empty
      // string is never re-touched by this test, so it round-trips to null.
      premium_amount: 90,
      premium_frequency: 'Monthly',
      deductible: 250,
      coverage_limits: '50/100',
      notes: null,
    })
    expect(createMutateAsync).not.toHaveBeenCalled()
  })
})
