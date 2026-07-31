import { describe, it, expect } from 'vitest'
import type { TFunction } from 'i18next'
import { makeHoursRecordSchema } from '../hours'

// Same shape as the global react-i18next mock in src/__tests__/setup.ts:
// messages come back as their i18n key, which is all these tests need.
const t = ((key: string) => key) as unknown as TFunction

const hoursRecordSchema = makeHoursRecordSchema(t)

describe('Hours Record Schema', () => {
  const validHours = {
    date: '2024-03-01',
    engine_hours: 812.4,
  }

  it('validates a valid hours record', () => {
    const result = hoursRecordSchema.safeParse(validHours)
    expect(result.success).toBe(true)
  })

  it('validates with optional notes', () => {
    const result = hoursRecordSchema.safeParse({
      ...validHours,
      notes: 'Monthly reading',
    })
    expect(result.success).toBe(true)
  })

  it('requires date', () => {
    const result = hoursRecordSchema.safeParse({ engine_hours: 812.4 })
    expect(result.success).toBe(false)
  })

  it('requires engine_hours', () => {
    const result = hoursRecordSchema.safeParse({ date: '2024-03-01' })
    expect(result.success).toBe(false)
  })

  it('requires date in YYYY-MM-DD format', () => {
    const result = hoursRecordSchema.safeParse({
      ...validHours,
      date: 'March 1, 2024',
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative engine_hours', () => {
    const result = hoursRecordSchema.safeParse({
      ...validHours,
      engine_hours: -1,
    })
    expect(result.success).toBe(false)
  })

  it('accepts non-integer engine_hours (Numeric(10,1) Decimal)', () => {
    const result = hoursRecordSchema.safeParse({
      ...validHours,
      engine_hours: 812.5,
    })
    expect(result.success).toBe(true)
  })

  it('rejects engine_hours exceeding max', () => {
    const result = hoursRecordSchema.safeParse({
      ...validHours,
      engine_hours: 1_000_000_000,
    })
    expect(result.success).toBe(false)
  })
})
