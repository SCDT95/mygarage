import { z } from 'zod'
import { dateSchema, currencySchema, notesSchema } from './shared'

/**
 * Tax record schema matching backend Pydantic validators.
 * See: backend/app/schemas/tax.py
 */

/**
 * Persisted tax_type values. Backend contract:
 * Literal["Registration", "Inspection", "Property Tax", "Tolls"] — never translate these.
 */
export const TAX_TYPE_VALUES = ['Registration', 'Inspection', 'Property Tax', 'Tolls'] as const

export type TaxTypeValue = (typeof TAX_TYPE_VALUES)[number]

/** Form options: API `value` plus the i18n `labelKey` resolved at render. */
export const TAX_TYPES = [
  { value: 'Registration', labelKey: 'forms:taxTypes.registration' },
  { value: 'Inspection', labelKey: 'forms:taxTypes.inspection' },
  { value: 'Property Tax', labelKey: 'forms:taxTypes.propertyTax' },
  { value: 'Tolls', labelKey: 'forms:taxTypes.tolls' },
] as const satisfies readonly { value: TaxTypeValue; labelKey: string }[]

export const taxRecordSchema = z.object({
  date: dateSchema,
  tax_type: z.enum(TAX_TYPE_VALUES).optional(),
  amount: currencySchema,
  renewal_date: dateSchema.optional(),
  notes: notesSchema.optional(),
})

// Use z.output for Zod v4 compatibility with z.coerce fields
export type TaxRecordInput = z.input<typeof taxRecordSchema>
export type TaxRecordFormData = z.output<typeof taxRecordSchema>
