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

  it('rejects NaN as invalid rather than silently discarding it', () => {
    const r = optObj.safeParse({ amount: NaN })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toBe('common:validation.amount.invalid')
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

  it('rejects NaN on a REQUIRED field as invalid, not as dropped/empty', () => {
    // Post-Task-8b: NaN can only arrive from a control that failed to parse
    // (never an empty one, since registerDecimal emits undefined for empty),
    // so it now reports invalidKey rather than requiredKey.
    const r = reqObj.safeParse({ amount: NaN })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toBe('common:validation.amount.invalid')
  })

  it('rejects NaN on an OPTIONAL field as invalid too, not as empty', () => {
    const r = optObj.safeParse({ amount: NaN })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toBe('common:validation.amount.invalid')
  })
})
