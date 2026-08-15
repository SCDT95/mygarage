import { describe, it, expect } from 'vitest'
import type { TFunction } from 'i18next'
import { makeSpotRentalSchema } from '../spotRental'
import { INVALID_NUMBER } from '../shared'

// Same shape as the global react-i18next mock in src/__tests__/setup.ts:
// messages come back as their i18n key, which is all these tests need.
const t = ((key: string) => key) as unknown as TFunction

const spotRentalSchema = makeSpotRentalSchema(t)

describe('Spot Rental Schema', () => {
  const validRental = {
    check_in_date: '2024-07-01',
  }

  it('validates valid spot rental with required fields only', () => {
    const result = spotRentalSchema.safeParse(validRental)
    expect(result.success).toBe(true)
  })

  it('validates spot rental with all optional fields', () => {
    const result = spotRentalSchema.safeParse({
      ...validRental,
      location_name: 'Jellystone Park',
      location_address: '123 Camp Rd',
      check_out_date: '2024-07-07',
      nightly_rate: 55.00,
      weekly_rate: 350.00,
      monthly_rate: 1200.00,
      electric: 25.00,
      water: 10.00,
      waste: 15.00,
      total_cost: 400.00,
      amenities: 'Full hookup, WiFi, Pool',
      notes: 'Pull-through site #42',
    })
    expect(result.success).toBe(true)
  })

  it('requires check_in_date in YYYY-MM-DD format', () => {
    const result = spotRentalSchema.safeParse({
      check_in_date: 'July 1, 2024',
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative nightly_rate', () => {
    const result = spotRentalSchema.safeParse({
      ...validRental,
      nightly_rate: -10,
    })
    expect(result.success).toBe(false)
  })

  it('rejects nightly_rate exceeding max', () => {
    const result = spotRentalSchema.safeParse({
      ...validRental,
      nightly_rate: 10000,
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative utility cost', () => {
    const result = spotRentalSchema.safeParse({
      ...validRental,
      electric: -5,
    })
    expect(result.success).toBe(false)
  })

  it('rejects location_name over 100 characters', () => {
    const result = spotRentalSchema.safeParse({
      ...validRental,
      location_name: 'A'.repeat(101),
    })
    expect(result.success).toBe(false)
  })

  // Task 8b: these now route through the shared makeNumericField, which
  // rejects NaN as invalid rather than treating it as empty — see
  // shared.test.ts.
  it('rejects NaN nightly_rate as invalid rather than silently discarding it', () => {
    const result = spotRentalSchema.safeParse({
      ...validRental,
      nightly_rate: NaN,
    })
    expect(result.success).toBe(false)
  })

  // Regression for the CRITICAL finding: the pre-refactor `.min().max().or(
  // z.nan())` shape couldn't recognize INVALID_NUMBER (the sentinel
  // registerDecimal emits for unparseable text) and leaked zod's raw
  // "Invalid input: expected number, received symbol" instead of a
  // translated message. Assert all three rate tiers now report one.
  it('rejects the INVALID_NUMBER sentinel on every rate tier with a translated message, not a raw zod union error', () => {
    const result = spotRentalSchema.safeParse({
      ...validRental,
      nightly_rate: INVALID_NUMBER,
      weekly_rate: INVALID_NUMBER,
      electric: INVALID_NUMBER,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message)
      expect(messages).toContain('common:validation.spotRental.nightlyRateInvalid')
      expect(messages).toContain('common:validation.spotRental.rateInvalid')
      expect(messages).toContain('common:validation.spotRental.utilityInvalid')
      for (const m of messages) {
        expect(m).not.toMatch(/received symbol|expected number/i)
      }
    }
  })
})
