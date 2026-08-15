import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFormSubmit } from '../useFormSubmit'

// Real axios AxiosError instances extend Error (unlike the plain-object
// fakes used elsewhere in this suite for parseApiError, which only checks
// the `isAxiosError` property). The pre-fix hook branched on `err instanceof
// Error`, so the fake here must ALSO be a genuine Error instance or the old
// buggy branch and the new one would coincidentally produce the same output
// and the regression would go undetected.
function fakeAxiosError(status: number, detail: unknown): Error & { isAxiosError: true; response: unknown } {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true as const,
    response: { status, data: { detail } },
  })
}

// Regression fence for the final-review I3 finding: useFormSubmit powers the
// submit banner of WarrantyForm, HoursRecordForm, OdometerRecordForm and
// NoteForm. The pre-fix hook branched on whether the caught value was an
// Error instance and, if so, read its `.message` directly — which for an
// AxiosError returns the raw status line ("Request failed with status code
// 422") instead of the backend's actual field-validation detail — the #140
// opaque-string class this whole release exists to remove, still reachable
// through the ONE component this branch's own numeric-input migration
// touched most (two of the four forms had fields migrated).
describe('useFormSubmit error surfacing', () => {
  const onSuccess = vi.fn()
  const onClose = vi.fn()

  beforeEach(() => {
    onSuccess.mockClear()
    onClose.mockClear()
  })

  it('surfaces a 422 AxiosError detail through getActionErrorMessage, not the raw axios status line', async () => {
    const axiosError = fakeAxiosError(422, [
      { type: 'greater_than_equal', loc: ['body', 'hours'], msg: 'Input should be >= 0' },
    ])
    const submitFn = vi.fn().mockRejectedValue(axiosError)

    const { result } = renderHook(() =>
      useFormSubmit(submitFn, { onSuccess, onClose, action: 'save the hours record' }),
    )

    await act(async () => {
      await result.current.handleSubmit({} as never)
    })

    // Not the axios status line — that's the exact bug being fenced.
    expect(result.current.error).not.toBe('Request failed with status code 422')
    // A 422 with no matched field routes through applyServerErrors upstream
    // in the real forms; here (no field mapping) getActionErrorMessage falls
    // through to the translated "check your input" template rather than the
    // raw status string.
    expect(result.current.error).not.toBeNull()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('surfaces a 404 detail string verbatim (not the axios status line)', async () => {
    const axiosError = fakeAxiosError(404, 'Hours record not found')
    const submitFn = vi.fn().mockRejectedValue(axiosError)

    const { result } = renderHook(() =>
      useFormSubmit(submitFn, { onSuccess, onClose, action: 'save the hours record' }),
    )

    await act(async () => {
      await result.current.handleSubmit({} as never)
    })

    expect(result.current.error).toBe('Hours record not found')
  })

  it('clears the error and calls onSuccess/onClose on a successful submit', async () => {
    const submitFn = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useFormSubmit(submitFn, { onSuccess, onClose, action: 'save the hours record' }),
    )

    await act(async () => {
      await result.current.handleSubmit({} as never)
    })

    expect(result.current.error).toBeNull()
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
