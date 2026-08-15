import { z } from 'zod'
import type { TFunction } from 'i18next'
import { makeOptionalOdometerSchema } from './shared'

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
 * instead of a translated message. `mileage_limit_km` is a distance value,
 * same shape as every odometer_km field elsewhere, so it reuses
 * makeOptionalOdometerSchema directly rather than a bespoke factory — its
 * min (0) matches exactly; the field had no upper bound before, and
 * odometer's generous 9,999,999 km ceiling will never realistically bind.
 */
export const makeWarrantySchema = (t: TFunction) =>
  z.object({
    warranty_type: z.string().min(1, 'Warranty type is required'),
    provider: z.string().optional(),
    start_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().optional(),
    mileage_limit_km: makeOptionalOdometerSchema(t),
    coverage_details: z.string().optional(),
    policy_number: z.string().optional(),
    notes: z.string().optional(),
  })

export type WarrantyInput = z.input<ReturnType<typeof makeWarrantySchema>>
export type WarrantyFormData = z.output<ReturnType<typeof makeWarrantySchema>>
