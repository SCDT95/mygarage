import { describe, it, expect } from 'vitest'
import type { TFunction } from 'i18next'
import { makeDefRecordSchema } from '../def'
import { INVALID_NUMBER } from '../shared'

// Same shape as the global react-i18next mock in src/__tests__/setup.ts:
// messages come back as their i18n key, which is all these tests need.
const t = ((key: string) => key) as unknown as TFunction

const defRecordSchema = makeDefRecordSchema(t)

describe('DEF Record Schema', () => {
  const validDef = {
    date: '2024-04-10',
  }

  it('validates valid DEF record with required fields only', () => {
    const result = defRecordSchema.safeParse(validDef)
    expect(result.success).toBe(true)
  })

  it('validates DEF record with all optional fields', () => {
    const result = defRecordSchema.safeParse({
      ...validDef,
      odometer_km: 45000,
      liters: 2.5,
      price_per_unit: 3.99,
      cost: 9.98,
      fill_level: 75,
      source: 'Truck Stop',
      brand: 'Blue DEF',
      notes: 'Topped off at half tank',
    })
    expect(result.success).toBe(true)
  })

  it('requires date in YYYY-MM-DD format', () => {
    const result = defRecordSchema.safeParse({ date: '04-10-2024' })
    expect(result.success).toBe(false)
  })

  it('rejects fill_level below 0', () => {
    const result = defRecordSchema.safeParse({
      ...validDef,
      fill_level: -1,
    })
    expect(result.success).toBe(false)
  })

  it('rejects fill_level above 100', () => {
    const result = defRecordSchema.safeParse({
      ...validDef,
      fill_level: 101,
    })
    expect(result.success).toBe(false)
  })

  // Task 8b: fill_level now routes through the shared makeNumericField,
  // which rejects NaN as invalid rather than treating it as empty — see
  // shared.test.ts.
  it('rejects NaN fill_level as invalid rather than silently discarding it', () => {
    const result = defRecordSchema.safeParse({
      ...validDef,
      fill_level: NaN,
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative mileage', () => {
    const result = defRecordSchema.safeParse({
      ...validDef,
      odometer_km: -100,
    })
    expect(result.success).toBe(false)
  })

  it('rejects source over 100 characters', () => {
    const result = defRecordSchema.safeParse({
      ...validDef,
      source: 'A'.repeat(101),
    })
    expect(result.success).toBe(false)
  })

  // Regression for the CRITICAL finding: the pre-refactor `.or(z.nan())`
  // shape couldn't recognize INVALID_NUMBER (the sentinel registerDecimal
  // emits for unparseable text) and leaked zod's raw "Invalid input:
  // expected number, received symbol" instead of a translated message.
  it('rejects the INVALID_NUMBER sentinel with the translated fill-level-invalid message, not a raw zod union error', () => {
    const result = defRecordSchema.safeParse({
      ...validDef,
      fill_level: INVALID_NUMBER,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('common:validation.def.fillLevelInvalid')
    }
  })
})
