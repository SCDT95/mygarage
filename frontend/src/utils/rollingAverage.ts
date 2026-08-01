/**
 * Trailing average over a window of up to `period` values.
 *
 * Unlike a strict N-period moving average — which is undefined (null) for the
 * first N-1 points — this averages however many values exist so far, so the
 * result has NO leading nulls: every index gets a number. That lets a trend
 * line span the full width of a chart instead of starting late (used by the
 * garage Monthly Spending Trend, where the 3-/6-month average lines previously
 * began several months in).
 *
 * @param values - the per-period totals, oldest first
 * @param period - the maximum window size (e.g. 3 or 6 months)
 * @returns one average per input index; empty in → empty out
 */
export function trailingAverage(values: number[], period: number): number[] {
  return values.map((_, idx) => {
    const start = Math.max(0, idx - period + 1)
    const window = values.slice(start, idx + 1)
    return window.reduce((sum, v) => sum + v, 0) / window.length
  })
}
