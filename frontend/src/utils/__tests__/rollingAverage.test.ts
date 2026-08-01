import { describe, it, expect } from 'vitest'
import { trailingAverage } from '../rollingAverage'

describe('trailingAverage', () => {
  it('emits a value for EVERY index — no leading nulls (so a trend line spans the full width)', () => {
    // The whole point of the fix: with a strict moving average, index 0 (and the
    // first period-1 points) would be null and the line would start late.
    const out = trailingAverage([10, 20, 30, 40], 3)
    expect(out).toHaveLength(4)
    expect(out.every((v) => typeof v === 'number' && !Number.isNaN(v))).toBe(true)
    expect(out[0]).not.toBeNull()
  })

  it('uses a partial window for early indices, then the full period', () => {
    // idx0: [10]/1=10 · idx1: [10,20]/2=15 · idx2: [10,20,30]/3=20 · idx3: [20,30,40]/3=30
    expect(trailingAverage([10, 20, 30, 40], 3)).toEqual([10, 15, 20, 30])
  })

  it('a 6-period average also starts at index 0 (partial) so both lines align at the left edge', () => {
    const out = trailingAverage([12, 8, 4], 6)
    expect(out[0]).toBe(12) // [12]/1
    expect(out[1]).toBe(10) // [12,8]/2
    expect(out[2]).toBeCloseTo(8) // [12,8,4]/3
  })

  it('returns an empty array for empty input', () => {
    expect(trailingAverage([], 3)).toEqual([])
  })
})
