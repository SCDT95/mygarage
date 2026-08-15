import { z } from 'zod'
import type { TFunction } from 'i18next'
import { makeDateSchema, makeNotesSchema, makeNumericField } from './shared'

/**
 * Spot rental schema matching backend Pydantic validators.
 * See: backend/app/schemas/spot_rental.py
 *
 * CRITICAL: This schema fixes 8 missing isNaN validation bugs in SpotRentalForm
 *
 * Factory, not a constant — see the header of schemas/auth.ts for why.
 *
 * Task 8 moved every rate/utility field here onto NumberInput/registerDecimal,
 * which can hand this schema the INVALID_NUMBER sentinel for unparseable
 * text — the old `.min().max().or(z.nan())` shape only recognized
 * number/NaN, so a sentinel failed the union and zod reported its raw
 * "expected number, received symbol" instead of a translated message. Routed
 * through the shared makeNumericField, preserving the file's existing
 * three-tier bound structure (nightly/large/utility) exactly — these are
 * deliberately narrower than the generic currency factory's ceiling in two
 * of the three tiers, so they keep their own bespoke min/max rather than
 * being swapped onto makeOptionalCurrencySchema.
 */

// Currency validators specific to spot rental limits.
const makeOptionalNightlyRateSchema = (t: TFunction) =>
  makeNumericField(t, {
    min: 0,
    max: 9999.99,
    negativeKey: 'common:validation.spotRental.nightlyRateNegative',
    tooLargeKey: 'common:validation.spotRental.nightlyRateTooLarge',
    invalidKey: 'common:validation.spotRental.nightlyRateInvalid',
  })

const makeOptionalLargeRateSchema = (t: TFunction) =>
  makeNumericField(t, {
    min: 0,
    max: 99999.99,
    negativeKey: 'common:validation.spotRental.rateNegative',
    tooLargeKey: 'common:validation.spotRental.rateTooLarge',
    invalidKey: 'common:validation.spotRental.rateInvalid',
  })

const makeOptionalUtilitySchema = (t: TFunction) =>
  makeNumericField(t, {
    min: 0,
    max: 9999.99,
    negativeKey: 'common:validation.spotRental.utilityNegative',
    tooLargeKey: 'common:validation.spotRental.utilityTooLarge',
    invalidKey: 'common:validation.spotRental.utilityInvalid',
  })

export const makeSpotRentalSchema = (t: TFunction) =>
  z.object({
    location_name: z
      .string()
      .max(100, t('common:validation.spotRental.locationNameTooLong'))
      .optional(),
    location_address: z.string().optional(),
    check_in_date: makeDateSchema(t),
    check_out_date: z.string().optional(),
    nightly_rate: makeOptionalNightlyRateSchema(t),
    weekly_rate: makeOptionalLargeRateSchema(t),
    monthly_rate: makeOptionalLargeRateSchema(t),
    electric: makeOptionalUtilitySchema(t),
    water: makeOptionalUtilitySchema(t),
    waste: makeOptionalUtilitySchema(t),
    total_cost: makeOptionalLargeRateSchema(t),
    amenities: z.string().optional(),
    notes: makeNotesSchema(t).optional(),
  })

// Use z.output for Zod v4 compatibility with z.coerce fields
export type SpotRentalInput = z.input<ReturnType<typeof makeSpotRentalSchema>>
export type SpotRentalFormData = z.output<ReturnType<typeof makeSpotRentalSchema>>
