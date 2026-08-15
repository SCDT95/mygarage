import { describe, it, expect } from 'vitest'
import { makeWarrantySchema } from '../warranty'
import { INVALID_NUMBER } from '../shared'

const t = ((key: string) => key) as unknown as Parameters<typeof makeWarrantySchema>[0]
const warrantySchema = makeWarrantySchema(t)

describe('Warranty Schema', () => {
  const validWarranty = {
    warranty_type: 'Manufacturer',
    start_date: '2024-01-15',
  }

  it('validates valid warranty with required fields only', () => {
    const result = warrantySchema.safeParse(validWarranty)
    expect(result.success).toBe(true)
  })

  it('validates warranty with all optional fields', () => {
    const result = warrantySchema.safeParse({
      ...validWarranty,
      provider: 'Ford Motor Company',
      end_date: '2027-01-15',
      mileage_limit_km: 36000,
      coverage_details: 'Full bumper-to-bumper coverage',
      policy_number: 'W-12345',
      notes: 'Transferable to new owner',
    })
    expect(result.success).toBe(true)
  })

  it('requires warranty_type', () => {
    const result = warrantySchema.safeParse({ start_date: '2024-01-15' })
    expect(result.success).toBe(false)
  })

  it('requires start_date', () => {
    const result = warrantySchema.safeParse({ warranty_type: 'Extended' })
    expect(result.success).toBe(false)
  })

  it('rejects negative mileage_limit', () => {
    const result = warrantySchema.safeParse({
      ...validWarranty,
      mileage_limit_km: -1000,
    })
    expect(result.success).toBe(false)
  })

  // Task 8b: mileage_limit_km now routes through the shared makeNumericField,
  // which rejects NaN as invalid rather than treating it as empty — see
  // shared.test.ts.
  it('rejects NaN mileage_limit as invalid rather than silently discarding it', () => {
    const result = warrantySchema.safeParse({
      ...validWarranty,
      mileage_limit_km: NaN,
    })
    expect(result.success).toBe(false)
  })

  // Review-response round 2: mileage_limit_km must NOT have picked up
  // makeOptionalOdometerSchema's 9,999,999 km ceiling — this field never had
  // an upper bound, and the backend (warranty.py) allows up to
  // 99,999,999.99. A value above the borrowed-factory ceiling but still
  // realistic must pass.
  it('accepts a mileage_limit_km above the odometer factory\'s ceiling (the field itself has no upper bound)', () => {
    const result = warrantySchema.safeParse({
      ...validWarranty,
      mileage_limit_km: 50_000_000,
    })
    expect(result.success).toBe(true)
  })

  it('accepts non-integer mileage_limit_km (canonical km Decimal)', () => {
    // Under metric-canonical, mileage_limit_km is a Decimal in km.
    // Non-integer values are valid (e.g. converted from integer miles).
    const result = warrantySchema.safeParse({
      ...validWarranty,
      mileage_limit_km: 36000.5,
    })
    expect(result.success).toBe(true)
  })

  // Regression for the CRITICAL finding: the pre-refactor `.or(z.nan())`
  // shape couldn't recognize INVALID_NUMBER (the sentinel registerDecimal
  // emits for unparseable text) and leaked zod's raw "Invalid input:
  // expected number, received symbol" instead of a translated message.
  it('rejects the INVALID_NUMBER sentinel with the translated odometer-invalid message, not a raw zod union error', () => {
    const result = warrantySchema.safeParse({
      ...validWarranty,
      mileage_limit_km: INVALID_NUMBER,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('common:validation.odometer.invalid')
    }
  })
})
