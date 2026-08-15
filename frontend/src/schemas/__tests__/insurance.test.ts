import { describe, it, expect } from 'vitest'
import type { TFunction } from 'i18next'
import { makeInsuranceSchema } from '../insurance'

// The i18n mock elsewhere in the suite echoes keys back; do the same here so
// a failed assertion shows the offending key instead of a component-owned
// string this module has no business rendering.
const t = ((k: string) => k) as unknown as TFunction
const schema = makeInsuranceSchema(t)

describe('Insurance Schema', () => {
  const validInsurance = {
    provider: 'State Farm',
    policy_number: 'POL-2024-12345',
    policy_type: 'Full Coverage',
    start_date: '2024-01-01',
    end_date: '2024-12-31',
  }

  it('validates valid insurance with required fields only', () => {
    const result = schema.safeParse(validInsurance)
    expect(result.success).toBe(true)
  })

  // [rev2] premium_amount/deductible are ABSENT keys here, not undefined ones
  // — `z.unknown().optional()` rejects an absent key differently than an
  // explicitly-undefined one (see schemas/shared.ts), so this is the case
  // that actually exercises the trap.
  it('accepts an insurance record with premium_amount/deductible entirely absent', () => {
    const { ...noOptionalKeys } = validInsurance
    const result = schema.safeParse(noOptionalKeys)
    expect(result.success).toBe(true)
  })

  it('validates insurance with all optional fields as numbers', () => {
    const result = schema.safeParse({
      ...validInsurance,
      premium_amount: 150.0,
      premium_frequency: 'Monthly',
      deductible: 500,
      coverage_limits: '100/300/100',
      notes: 'Multi-vehicle discount applied',
    })
    expect(result.success).toBe(true)
  })

  it('requires provider', () => {
    const { provider: _provider, ...missing } = validInsurance
    const result = schema.safeParse(missing)
    expect(result.success).toBe(false)
  })

  it('requires policy_number', () => {
    const { policy_number: _policy_number, ...missing } = validInsurance
    const result = schema.safeParse(missing)
    expect(result.success).toBe(false)
  })

  it('requires policy_type', () => {
    const { policy_type: _policy_type, ...missing } = validInsurance
    const result = schema.safeParse(missing)
    expect(result.success).toBe(false)
  })

  it('requires start_date', () => {
    const { start_date: _start_date, ...missing } = validInsurance
    const result = schema.safeParse(missing)
    expect(result.success).toBe(false)
  })

  it('requires end_date', () => {
    const { end_date: _end_date, ...missing } = validInsurance
    const result = schema.safeParse(missing)
    expect(result.success).toBe(false)
  })

  // #140: the reported failure mode — comma-decimal text is not a `number`.
  // (An empty string is not tested here as "invalid" — the factory treats ''
  // as EMPTY, same as absent, and transforms it to `undefined`. That's by
  // design: `registerDecimal` never lets raw '' reach the resolver as a
  // string in the real form, and treating it as empty rather than invalid is
  // exactly what lets an untouched optional field pass validation.)
  it('rejects a raw string premium_amount (the pre-fix #140 payload shape)', () => {
    const result = schema.safeParse({ ...validInsurance, premium_amount: '528,25' })
    expect(result.success).toBe(false)
  })

  // Final-review I5: makeOptionalCurrencySchema's 99,999.99 ceiling doesn't
  // exist on the backend (insurance.py — `ge=0`, no `le`), and insurance is
  // THE #140 form. A high-value policy premium/deductible must not be
  // client-side-rejected when the API would accept it.
  it('accepts a premium_amount/deductible above the old 99,999.99 currency-factory ceiling', () => {
    const result = schema.safeParse({
      ...validInsurance,
      premium_amount: 500000,
      deductible: 250000,
    })
    expect(result.success).toBe(true)
  })

  it('still rejects a negative premium_amount (the floor is real, only the ceiling was removed)', () => {
    const result = schema.safeParse({ ...validInsurance, premium_amount: -100 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('common:validation.amount.negative')
    }
  })
})
