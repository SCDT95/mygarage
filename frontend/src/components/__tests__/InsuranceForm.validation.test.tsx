import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../../__tests__/test-utils'

const createMutateAsync = vi.fn().mockResolvedValue({})
vi.mock('../../hooks/queries/useInsuranceRecords', () => ({
  useCreateInsuranceRecord: () => ({ mutateAsync: createMutateAsync }),
  useUpdateInsuranceRecord: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import InsuranceForm from '../InsuranceForm'

beforeEach(() => {
  vi.clearAllMocks()
  createMutateAsync.mockResolvedValue({})
})

const fillRequired = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.type(screen.getByLabelText('insurance.provider *'), 'PZU')
  await user.type(screen.getByLabelText('insurance.policyNumber *'), 'POL-1')
  await user.selectOptions(screen.getByLabelText('insurance.policyType *'), 'Liability')
  // start_date/end_date default to TODAY (formatDateForInput(undefined)), not
  // '' — clear before typing or the new digits collide with the pre-filled
  // value instead of replacing it.
  await user.clear(screen.getByLabelText('common:startDate *'))
  await user.type(screen.getByLabelText('common:startDate *'), '2026-01-01')
  await user.clear(screen.getByLabelText('common:endDate *'))
  await user.type(screen.getByLabelText('common:endDate *'), '2026-12-31')
}
// the create button is common:create, not insurance.save
const save = (): HTMLElement => screen.getByRole('button', { name: 'common:create' })

describe('InsuranceForm — issue #140', () => {
  it('accepts a comma decimal premium and nulls an empty deductible', async () => {
    const user = userEvent.setup()
    render(<InsuranceForm vin="1HGBH41JXMN109186" onClose={vi.fn()} onSuccess={vi.fn()} />)
    await fillRequired(user)
    await user.type(screen.getByLabelText('insurance.premiumAmount'), '528,25')
    await user.click(save())

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled())
    const payload = createMutateAsync.mock.calls[0][0]
    expect(payload.premium_amount).toBe(528.25)
    expect(payload.deductible).toBeNull() // was the empty string
  })

  it('shows an invalid premium under its own field, not as a status code', async () => {
    const user = userEvent.setup()
    render(<InsuranceForm vin="1HGBH41JXMN109186" onClose={vi.fn()} onSuccess={vi.fn()} />)
    await fillRequired(user)
    await user.type(screen.getByLabelText('insurance.premiumAmount'), 'abc')
    await user.click(save())

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('common:validation.amount.invalid')
    )
    expect(createMutateAsync).not.toHaveBeenCalled()
  })
})
