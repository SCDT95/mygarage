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
 * accepts. All five — including `total` — were `.nonnegative()` with no max
 * before Task 8 (see `git show a920cbc:frontend/src/schemas/spotRentalBilling.ts`):
 * preserved as min:0/max:Infinity. [Final-review I6 correction: an earlier
 * ruling here claimed `total` had NO constraint at all and set it to
 * min:-Infinity — that premise was wrong, verified against the pre-Task-8
 * source above, which shows `total` DID have `.nonnegative()` same as its
 * four siblings. This was a lost floor, not an absent one; restored rather
 * than left as a "product decision for later."]
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
      min: 0,
      max: Infinity,
      negativeKey: 'common:validation.amount.negative',
      tooLargeKey: 'common:validation.amount.tooLarge',
      invalidKey: 'common:validation.amount.invalid',
    }),
    notes: z.string().max(1000, 'Notes must be 1000 characters or less').optional(),
  })

export type SpotRentalBillingFormData = z.output<ReturnType<typeof makeSpotRentalBillingSchema>>
