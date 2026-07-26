import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/test-utils'
import { fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Reminder } from '../../types/reminder'

const createMock = vi.fn().mockResolvedValue({})
const updateMock = vi.fn().mockResolvedValue({})
vi.mock('../../hooks/useReminders', () => ({
  useCreateReminder: () => ({ mutateAsync: createMock }),
  useUpdateReminder: () => ({ mutateAsync: updateMock }),
}))
vi.mock('../../hooks/useUnitPreference', () => ({
  useUnitPreference: () => ({ system: 'imperial', showBoth: false }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import ReminderForm from '../ReminderForm'

const reminder = {
  id: 3, vin: 'V1', title: 'Registration', reminder_type: 'date', status: 'pending',
  due_date: '2026-09-01', due_mileage_km: null, estimated_due_date: null, notes: null,
  line_item_id: null, last_notified_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
} as unknown as Reminder

beforeEach(() => vi.clearAllMocks())

describe('ReminderForm — create vs update routing (SDQ-C)', () => {
  it('a valid date-type create fires the create mutation with the EXACT payload and NOT update (fails if create is unwired, misfields the payload, or routes to update)', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    render(<ReminderForm vin="V1" onClose={vi.fn()} onSuccess={onSuccess} />)
    await user.type(screen.getByLabelText('common:title *'), 'Oil change')  // type defaults to 'date' → due-date field shows
    fireEvent.change(screen.getByLabelText('reminder.dueDate *'), { target: { value: '2026-06-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'common:create' }))
    await vi.waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    // strict payload — a date-type reminder leaves due_mileage_km + notes undefined (never objectContaining, LD6)
    expect(createMock.mock.calls[0][0]).toStrictEqual({
      title: 'Oil change', reminder_type: 'date', due_date: '2026-06-01', due_mileage_km: undefined, notes: undefined,
    })
    expect(updateMock).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
  })

  it('editing a date-type reminder fires the update mutation with id + the EXACT payload and NOT create (fails if edit is unwired, drops id, or routes to create)', async () => {
    const onSuccess = vi.fn()
    render(<ReminderForm vin="V1" reminder={reminder} currentMileage={null} onClose={vi.fn()} onSuccess={onSuccess} />)
    fireEvent.click(screen.getByRole('button', { name: 'common:update' }))
    await vi.waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    expect(updateMock.mock.calls[0][0]).toStrictEqual({
      id: 3, title: 'Registration', reminder_type: 'date', due_date: '2026-09-01', due_mileage_km: undefined, notes: undefined,
    })
    expect(createMock).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
  })

  it('submitting with an empty title shows the title-required error and calls NEITHER mutation (fails if the required guard is dropped)', () => {
    render(<ReminderForm vin="V1" onClose={vi.fn()} onSuccess={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'common:create' }))
    expect(screen.getByText('reminder.titleRequired')).toBeInTheDocument()
    expect(createMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })
})
