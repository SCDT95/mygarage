import { z } from 'zod'
import type { TFunction } from 'i18next'
import { makeNumericField } from './shared'

/**
 * Warranty type options.
 *
 * `value` is the persisted/API value — it must never be translated or changed.
 * `labelKey` is the i18n key for the human-readable label, resolved at render.
 */
export const WARRANTY_TYPES = [
  { value: 'Manufacturer', labelKey: 'forms:warrantyTypes.manufacturer' },
  { value: 'Powertrain', labelKey: 'forms:warrantyTypes.powertrain' },
  { value: 'Extended', labelKey: 'forms:warrantyTypes.extended' },
  { value: 'Bumper-to-Bumper', labelKey: 'forms:warrantyTypes.bumperToBumper' },
  { value: 'Emissions', labelKey: 'forms:warrantyTypes.emissions' },
  { value: 'Corrosion', labelKey: 'forms:warrantyTypes.corrosion' },
  { value: 'Other', labelKey: 'forms:warrantyTypes.other' },
] as const

/**
 * Factory, not a constant — see the header of schemas/auth.ts for why.
 *
 * Task 8 moved mileage_limit_km onto NumberInput/registerDecimal, which can
 * hand this schema the INVALID_NUMBER sentinel for unparseable text — the
 * old `.or(z.nan())` shape only recognized number/NaN, so a sentinel failed
 * the union and zod reported its raw "expected number, received symbol"
 * instead of a translated message.
 *
 * `mileage_limit_km` is distance-shaped, so it reuses the odometer message
 * key family for text — but NOT the makeOptionalOdometerSchema factory
 * itself: that factory's 9,999,999 km ceiling is smaller than the backend's
 * actual limit (99,999,999.99, warranty.py), so borrowing it would reject
 * values the API accepts. This field had no upper bound before Task 8
 * either. Bespoke min:0/max:Infinity via the exported makeNumericField
 * preserves that exactly (review-response round 2 — see task-8-report.md).
 */
export const makeWarrantySchema = (t: TFunction) =>
  z.object({
    warranty_type: z.string().min(1, 'Warranty type is required'),
    provider: z.string().optional(),
    start_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().optional(),
    mileage_limit_km: makeNumericField(t, {
      min: 0,
      max: Infinity,
      negativeKey: 'common:validation.odometer.negative',
      tooLargeKey: 'common:validation.odometer.tooLarge',
      invalidKey: 'common:validation.odometer.invalid',
    }),
    coverage_details: z.string().optional(),
    policy_number: z.string().optional(),
    notes: z.string().optional(),
  })

export type WarrantyInput = z.input<ReturnType<typeof makeWarrantySchema>>
export type WarrantyFormData = z.output<ReturnType<typeof makeWarrantySchema>>
