import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ServiceVisitAttachmentUpload from '../ServiceVisitAttachmentUpload'

const apiPost = vi.fn()
vi.mock('../../services/api', () => ({ default: { post: (...a: unknown[]) => apiPost(...a) } }))

beforeEach(() => {
  vi.clearAllMocks()
  apiPost.mockResolvedValue({ data: {} })
})

// The hidden <input type="file"> is associated to the VISIBLE dropzone
// <label htmlFor="visit-file-upload"> (whose text is chooseFile before selection),
// so getByLabelText resolves the input THROUGH that label — proving the visible
// dropzone is wired to the real input, not an orphan hidden field.
const dropzone = () => screen.getByLabelText('serviceVisitAttachmentUpload.chooseFile') as HTMLInputElement

describe('ServiceVisitAttachmentUpload — validation + upload wiring', () => {
  it('rejects a disallowed file type with an error, shows no Upload button, and NEVER calls the API (fails if validateFile is bypassed or the error is not surfaced)', async () => {
    // applyAccept:false at setup so user-event's own accept="" pre-filter does NOT
    // silently drop the file — the point is to exercise the COMPONENT's validateFile.
    // (userEvent v14's instance `.upload()` takes no per-call options arg — the
    // `applyAccept` toggle is a setup()-time Option, not a 3rd upload() argument.)
    const user = userEvent.setup({ applyAccept: false })
    render(<ServiceVisitAttachmentUpload visitId={5} onUploadSuccess={vi.fn()} />)
    const bad = new File(['x'], 'malware.exe', { type: 'application/x-msdownload' })
    await user.upload(dropzone(), bad)
    expect(screen.getByText('serviceVisitAttachmentUpload.errorInvalidType')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'serviceVisitAttachmentUpload.upload' })).not.toBeInTheDocument()
    expect(apiPost).not.toHaveBeenCalled()
  })

  it('accepts a valid file via the real dropzone, then Upload POSTs the EXACT File to the exact endpoint/options and calls onUploadSuccess (fails if the input is unassociated, the file is dropped/mis-fielded, or the path/headers are wrong)', async () => {
    const user = userEvent.setup()
    const onUploadSuccess = vi.fn()
    render(<ServiceVisitAttachmentUpload visitId={5} onUploadSuccess={onUploadSuccess} />)
    const input = dropzone() // capture BEFORE selection — the label text then flips to the file name
    const good = new File(['receipt-bytes'], 'receipt.png', { type: 'image/png' })
    await user.upload(input, good)
    expect(input.files?.[0]).toBe(good) // the visible label is wired to THIS input
    expect(screen.getByText('receipt.png')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'serviceVisitAttachmentUpload.upload' }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1))
    const [url, body, opts] = apiPost.mock.calls[0] as [string, FormData, Record<string, unknown>]
    expect(url).toBe('/service-visits/5/attachments')
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('file')).toBe(good) // the exact File, under the exact field name 'file'
    expect(opts).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } })
    await waitFor(() => expect(onUploadSuccess).toHaveBeenCalledTimes(1))
  })

  it('Cancel clears the selection so Upload disappears (fails if Cancel is unwired)', async () => {
    const user = userEvent.setup()
    render(<ServiceVisitAttachmentUpload visitId={5} onUploadSuccess={vi.fn()} />)
    const good = new File(['x'], 'receipt.png', { type: 'image/png' })
    await user.upload(dropzone(), good)
    expect(screen.getByRole('button', { name: 'serviceVisitAttachmentUpload.upload' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'serviceVisitAttachmentUpload.cancel' }))
    expect(screen.queryByRole('button', { name: 'serviceVisitAttachmentUpload.upload' })).not.toBeInTheDocument()
  })
})
