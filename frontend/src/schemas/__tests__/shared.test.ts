import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  INVALID_NUMBER,
  makeOptionalCurrencySchema,
  makeCurrencySchema,
  makeOptionalVolumeSchema,
} from '@/schemas/shared'

const t = ((key: string) => key) as unknown as Parameters<typeof makeCurrencySchema>[0]

// [rev2] MUST test at object level. `z.unknown()` accepts `{amount: undefined}`
// but REJECTS an absent key with invalid_type — a bare safeParse(undefined)
// cannot catch that.
const optObj = z.object({ amount: makeOptionalCurrencySchema(t) })
const reqObj = z.object({ amount: makeCurrencySchema(t) })

describe('optional numeric factory', () => {
  it('accepts an ABSENT key', () => {
    expect(optObj.safeParse({}).success).toBe(true)
  })

  it('accepts an explicitly undefined key', () => {
    expect(optObj.safeParse({ amount: undefined }).success).toBe(true)
  })

  it('accepts a real number and range-checks it with the specific message', () => {
    expect(optObj.safeParse({ amount: 42.5 }).success).toBe(true)

    const neg = optObj.safeParse({ amount: -1 })
    expect(neg.success).toBe(false)
    if (!neg.success) expect(neg.error.issues[0].message).toBe('common:validation.amount.negative')

    const big = z.object({ v: makeOptionalVolumeSchema(t) }).safeParse({ v: 999999 })
    expect(big.success).toBe(false)
    if (!big.success) expect(big.error.issues[0].message).toBe('common:validation.volume.tooLarge')
  })

  it('rejects the invalid sentinel with the translated message', () => {
    const r = optObj.safeParse({ amount: INVALID_NUMBER })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toBe('common:validation.amount.invalid')
  })

  it('still maps NaN to undefined for now (Task 8b flips this)', () => {
    const r = optObj.safeParse({ amount: NaN })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.amount).toBeUndefined()
  })
})

describe('required numeric factory', () => {
  it('rejects an absent key with the required message', () => {
    const r = reqObj.safeParse({})
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toBe('common:validation.amount.required')
  })

  it('rejects the sentinel with the invalid message, distinct from required', () => {
    const r = reqObj.safeParse({ amount: INVALID_NUMBER })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toBe('common:validation.amount.invalid')
  })

  it('accepts a real number', () => {
    expect(reqObj.safeParse({ amount: 42.5 }).success).toBe(true)
  })
})
