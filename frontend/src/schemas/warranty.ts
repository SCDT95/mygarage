import { z } from 'zod'

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

const mileageLimitSchema = z
  .number()
  .min(0, 'Distance cannot be negative')
  .or(z.nan())
  .transform(val => isNaN(val) ? undefined : val)
  .optional()

export const warrantySchema = z.object({
  warranty_type: z.string().min(1, 'Warranty type is required'),
  provider: z.string().optional(),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().optional(),
  mileage_limit_km: mileageLimitSchema,
  coverage_details: z.string().optional(),
  policy_number: z.string().optional(),
  notes: z.string().optional(),
})

export type WarrantyInput = z.input<typeof warrantySchema>
export type WarrantyFormData = z.output<typeof warrantySchema>
