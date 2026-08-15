import { describe, it, expect } from 'vitest'
import { parseApiError } from '@/utils/httpErrorHandler'

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
