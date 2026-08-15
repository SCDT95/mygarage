import { z } from 'zod'
import type { TFunction } from 'i18next'
import { makeNumericField } from './shared'

/**
 * Factory, not a constant — see the header of schemas/auth.ts for why.
 *
 * Task 8 moved monthly_rate/electric/water/waste/total onto NumberInput/
 * registerDecimal, which can hand this schema the INVALID_NUMBER sentinel
 * for unparseable text — the old `.or(z.nan())` shape only recognized
 * number/NaN, so a sentinel failed the union and zod reported its raw
 * "expected number, received symbol" instead of a translated message.
 *
 * All five reuse the amount message-key family for text, but NOT the
 * makeOptionalCurrencySchema factory itself: its $99,999.99 ceiling doesn't
 * exist on the backend for any of these (spot_rental_billing.py has no
 * upper bound on any of them), so borrowing it would reject values the API
 * accepts. monthly_rate/electric/water/waste were `.nonnegative()` with no
 * max before Task 8 — preserved as min:0/max:Infinity. total had NO
 * constraint at all (not even non-negative) — preserved as
 * min:-Infinity/max:Infinity. A `total >= 0` floor is arguably a real
 * improvement (a negative billing total is nonsense), but tightening
 * validation is a product decision that belongs in its own change, not a
 * side effect of this message-formatting fix, so it stays unconstrained
 * (review-response round 2 — see task-8-report.md).
 */
export const makeSpotRentalBillingSchema = (t: TFunction) =>
  z.object({
    billing_date: z.string().min(1, 'Billing date is required'),
    monthly_rate: makeNumericField(t, {
      min: 0,
      max: Infinity,
      negativeKey: 'common:validation.amount.negative',
      tooLargeKey: 'common:validation.amount.tooLarge',
      invalidKey: 'common:validation.amount.invalid',
    }),
    electric: makeNumericField(t, {
      min: 0,
      max: Infinity,
      negativeKey: 'common:validation.amount.negative',
      tooLargeKey: 'common:validation.amount.tooLarge',
      invalidKey: 'common:validation.amount.invalid',
    }),
    water: makeNumericField(t, {
      min: 0,
      max: Infinity,
      negativeKey: 'common:validation.amount.negative',
      tooLargeKey: 'common:validation.amount.tooLarge',
      invalidKey: 'common:validation.amount.invalid',
    }),
    waste: makeNumericField(t, {
      min: 0,
      max: Infinity,
      negativeKey: 'common:validation.amount.negative',
      tooLargeKey: 'common:validation.amount.tooLarge',
      invalidKey: 'common:validation.amount.invalid',
    }),
    total: makeNumericField(t, {
      min: -Infinity,
      max: Infinity,
      // Unreachable at +/-Infinity — total never had a constraint in
      // either direction, so these two just point at the same message as
      // invalidKey rather than earning their own dead-code text.
      negativeKey: 'common:validation.amount.invalid',
      tooLargeKey: 'common:validation.amount.invalid',
      invalidKey: 'common:validation.amount.invalid',
    }),
    notes: z.string().max(1000, 'Notes must be 1000 characters or less').optional(),
  })

export type SpotRentalBillingFormData = z.output<ReturnType<typeof makeSpotRentalBillingSchema>>
