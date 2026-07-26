import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../../__tests__/test-utils'
import type { Note } from '../../types/note'

const createMock = vi.fn().mockResolvedValue({})
const updateMock = vi.fn().mockResolvedValue({})
vi.mock('../../hooks/queries/useNotes', () => ({
  useCreateNote: () => ({ mutateAsync: createMock }),
  useUpdateNote: () => ({ mutateAsync: updateMock }),
}))

import NoteForm from '../NoteForm'

beforeEach(() => vi.clearAllMocks())

describe('NoteForm — footer submit association (coupled anchor)', () => {
  it('clicking the footer Create (in the Drawer footer, sibling of the <form>) triggers the form submit (fails if the footer Save loses its form="note-form" association or accessible name)', async () => {
    render(<NoteForm vin="TEST12345678901234" onClose={vi.fn()} onSuccess={vi.fn()} />)
    // Create is in the sticky footer, a sibling of the <form>, wired via form="note-form".
    fireEvent.click(screen.getByRole('button', { name: 'common:create' }))
    // content is required; the message only renders because the submit fired.
    expect(await screen.findByText('common:validation.note.contentRequired')).toBeInTheDocument()
    // the empty-content submit is blocked by validation → the create mutation never fired.
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('NoteForm — create vs update routing (SDQ-C)', () => {
  const note = {
    id: 7, vin: 'V1', date: '2026-05-01', title: 'Trip', content: 'Went north',
    created_at: '2026-05-01T00:00:00Z', updated_at: null,
  } as unknown as Note

  it('a valid create fires the create mutation with the EXACT payload and NOT update (fails if create is unwired, misfields the payload, or routes to update)', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn(); const onClose = vi.fn()
    render(<NoteForm vin="V1" onClose={onClose} onSuccess={onSuccess} />)
    fireEvent.change(screen.getByLabelText('common:date *'), { target: { value: '2026-06-15' } })
    await user.type(screen.getByLabelText('note.content *'), 'Changed the oil')
    fireEvent.click(screen.getByRole('button', { name: 'common:create' }))
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    // strict payload — a dropped/extra field or a wrong value fails toStrictEqual (never objectContaining, LD6)
    expect(createMock.mock.calls[0][0]).toStrictEqual({ vin: 'V1', date: '2026-06-15', title: '', content: 'Changed the oil' })
    expect(updateMock).not.toHaveBeenCalled()
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('editing an existing note fires the update mutation with id + the EXACT payload and NOT create (fails if edit is unwired, drops id, or routes to create)', async () => {
    const onSuccess = vi.fn(); const onClose = vi.fn()
    render(<NoteForm vin="V1" note={note} onClose={onClose} onSuccess={onSuccess} />)
    // footer Save reads 'common:update' when editing
    fireEvent.click(screen.getByRole('button', { name: 'common:update' }))
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    expect(updateMock.mock.calls[0][0]).toStrictEqual({ id: 7, vin: 'V1', date: '2026-05-01', title: 'Trip', content: 'Went north' })
    expect(createMock).not.toHaveBeenCalled()
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
