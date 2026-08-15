import { describe, it, expect, vi } from 'vitest'
import type { Path } from 'react-hook-form'
import { applyServerErrors } from '@/hooks/useApiFormErrors'

const axios422 = (detail: unknown): unknown => ({
  isAxiosError: true,
  message: 'Request failed with status code 422',
  response: { status: 422, data: { detail } },
})

interface TestValues {
  premium_amount?: number
  deductible?: number
}

describe('applyServerErrors', () => {
  it('attaches a known field', () => {
    const setFieldError = vi.fn()
    const knownFields: ReadonlyArray<Path<TestValues>> = ['premium_amount', 'deductible']
    const r = applyServerErrors(setFieldError, axios422([
      { type: 'decimal_parsing', loc: ['body', 'deductible'], msg: 'Input should be a valid decimal' },
    ]), knownFields)

    expect(r.attached.map(p => p.field)).toEqual(['deductible'])
    expect(r.unhandled).toEqual([])
    expect(setFieldError).toHaveBeenCalledWith('deductible', {
      type: 'server', message: 'Input should be a valid decimal',
    })
  })

  it('leaves an unknown field unhandled instead of attaching it somewhere wrong', () => {
    const setFieldError = vi.fn()
    const knownFields: ReadonlyArray<Path<TestValues>> = ['premium_amount']
    const r = applyServerErrors(setFieldError, axios422([
      { type: 'missing', loc: ['query', 'vin'], msg: 'Field required' },
    ]), knownFields)

    expect(r.attached).toEqual([])
    expect(r.unhandled.map(p => p.field)).toEqual(['query.vin'])
    expect(setFieldError).not.toHaveBeenCalled()
  })

  // [rev2] the regression the boolean return hid
  it('reports BOTH attached and unhandled for a mixed payload', () => {
    const setFieldError = vi.fn()
    const knownFields: ReadonlyArray<Path<TestValues>> = ['deductible']
    const r = applyServerErrors(setFieldError, axios422([
      { type: 'decimal_parsing', loc: ['body', 'deductible'], msg: 'bad decimal' },
      { type: 'missing', loc: ['query', 'vin'], msg: 'Field required' },
    ]), knownFields)

    expect(r.attached.map(p => p.field)).toEqual(['deductible'])
    expect(r.unhandled.map(p => p.field)).toEqual(['query.vin'])
  })

  it('does nothing for a non-validation error', () => {
    const setFieldError = vi.fn()
    const knownFields: ReadonlyArray<Path<TestValues>> = ['premium_amount']
    const r = applyServerErrors(setFieldError, new Error('boom'), knownFields)
    expect(r.attached).toEqual([])
    expect(r.unhandled).toEqual([])
    expect(setFieldError).not.toHaveBeenCalled()
  })

  it('rejects a field name the form does not register (compile-time)', () => {
    // Fence for the ReadonlyArray<Path<T>> signature. If someone widens
    // knownFields back to string[], @ts-expect-error becomes an UNUSED
    // suppression and tsc fails — which is the point.
    const setFieldError = vi.fn()
    applyServerErrors<TestValues>(setFieldError, new Error('x'), [
      'premium_amount',
      // @ts-expect-error — not a key of TestValues
      'policy_numbr',
    ])
    expect(setFieldError).not.toHaveBeenCalled()
  })
})
