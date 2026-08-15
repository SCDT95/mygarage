import { describe, it, expect } from 'vitest'
import { parseApiError, getActionErrorMessage } from '@/utils/httpErrorHandler'

const axios422 = (detail: unknown): unknown => ({
  isAxiosError: true,
  message: 'Request failed with status code 422',
  response: { status: 422, data: { detail } },
})

describe('parseApiError on a FastAPI 422', () => {
  it('extracts field problems instead of stringifying the array', () => {
    const parsed = parseApiError(axios422([
      { type: 'decimal_parsing', loc: ['body', 'deductible'], msg: 'Input should be a valid decimal', input: '' },
    ]))
    expect(parsed.status).toBe(422)
    expect(parsed.fieldErrors).toEqual([
      { field: 'deductible', message: 'Input should be a valid decimal', type: 'decimal_parsing' },
    ])
    expect(parsed.detail ?? '').not.toContain('[object Object]')
  })

  it('leaves a plain string detail alone and reports no field errors', () => {
    const parsed = parseApiError({
      isAxiosError: true,
      message: 'Request failed with status code 404',
      response: { status: 404, data: { detail: 'Vehicle not found' } },
    })
    expect(parsed.detail).toBe('Vehicle not found')
    expect(parsed.fieldErrors).toEqual([])
  })

  it('reports no field errors for a network failure', () => {
    const parsed = parseApiError({ isAxiosError: true, message: 'Network Error' })
    expect(parsed.isNetworkError).toBe(true)
    expect(parsed.fieldErrors).toEqual([])
  })
})

// Regression fence for Task 10c review IMPORTANT finding: getActionErrorMessage
// only surfaced `detail` for 400/422/409, so a 404 raised as
// `HTTPException(404, "X not found")` fell through to the generic "requested
// resource was not found" template — discarding backend specificity at every
// converted 10c site that surfaces a 404 (VehicleSharingModal x3,
// VehicleTransferWizard, DeleteUserModal, FamilyManagementModal,
// VehicleRemoveModal, SettingsBackupTab).
describe('getActionErrorMessage on a 404', () => {
  const axios404 = (detail?: unknown): unknown => ({
    isAxiosError: true,
    message: 'Request failed with status code 404',
    response: { status: 404, data: detail === undefined ? {} : { detail } },
  })

  it('surfaces a 404 detail string verbatim instead of the generic "not found" template', () => {
    expect(getActionErrorMessage(axios404('Backup file not found'), 'restore the backup')).toBe(
      'Backup file not found'
    )
    expect(getActionErrorMessage(axios404('Share not found'), 'revoke the share')).toBe(
      'Share not found'
    )
  })

  it('falls back to the AxiosError message (not the generic "resource not found" status template) when a 404 has no data.detail at all', () => {
    // parseApiError only leaves `detail` undefined when the raw detail is a
    // 422-shaped validation array; a 404 with no `data.detail` field falls
    // back to the AxiosError's own `.message` instead (still informative,
    // never empty). What this test actually pins down is that the fallback
    // is no longer the OLD code's generic STATUS_MESSAGES[404] template —
    // asserted as the literal, un-interpolated default value since this
    // suite's i18next singleton isn't initialized outside a rendered
    // component (see ReminderForm.test.tsx:114 for the same pattern): the
    // old code produced 'Failed to {{action}}. {{message}}' here instead.
    const message = getActionErrorMessage(axios404(), 'restore the backup')
    expect(message).toBe('Request failed with status code 404')
  })

  it('surfaces a 404 detail that is a validation-problem array as the generic phrasing, never stringified', () => {
    // Contrived (FastAPI only sends array `detail` on 422 in this backend),
    // but exercises the branch where `parsed.detail` is genuinely undefined
    // at 404 status, proving the "check your input" fallback is reachable
    // and that an array never leaks through as [object Object].
    const message = getActionErrorMessage(
      {
        isAxiosError: true,
        message: 'Request failed with status code 404',
        response: {
          status: 404,
          data: { detail: [{ type: 'value_error', loc: ['body', 'vin'], msg: 'bad vin' }] },
        },
      },
      'restore the backup'
    )
    expect(message).not.toContain('[object Object]')
    expect(message).toBe('Failed to {{action}}. Please check your input.')
  })
})
