import { z } from 'zod'
import type { TFunction } from 'i18next'
import { makeNumericField } from './shared'

/**
 * Insurance policy schema matching backend Pydantic validators.
 * See: backend/app/schemas/insurance.py
 */

/**
 * Option lists for the insurance form.
 *
 * `value` is the persisted/API value — it must never be translated or changed.
 * `labelKey` is the i18n key for the human-readable label, resolved at render.
 */
export const POLICY_TYPES = [
  { value: 'Liability', labelKey: 'forms:policyTypes.liability' },
  { value: 'Comprehensive', labelKey: 'forms:policyTypes.comprehensive' },
  { value: 'Collision', labelKey: 'forms:policyTypes.collision' },
  { value: 'Full Coverage', labelKey: 'forms:policyTypes.fullCoverage' },
  { value: 'Minimum', labelKey: 'forms:policyTypes.minimum' },
  { value: 'Other', labelKey: 'forms:policyTypes.other' },
] as const

export const PREMIUM_FREQUENCIES = [
  { value: 'Monthly', labelKey: 'forms:premiumFrequencies.monthly' },
  { value: 'Quarterly', labelKey: 'forms:premiumFrequencies.quarterly' },
  { value: 'Semi-Annual', labelKey: 'forms:premiumFrequencies.semiAnnual' },
  { value: 'Annual', labelKey: 'forms:premiumFrequencies.annual' },
] as const

/**
 * Factory, not a module-level constant — see the header of schemas/auth.ts for
 * why. `premium_amount` and `deductible` are genuinely optional on the backend
 * (`Decimal | None`); the bug (#140) was that the form sent the raw string
 * `"528,25"` for a comma-decimal locale and `""` for an untouched optional
 * field, both of which the backend's 422 rejected with no per-field detail.
 * Routing them through the locale-aware `NumberInput`/`registerDecimal` fixes
 * both — it reports `common:validation.amount.invalid` instead of a bare
 * status code.
 *
 * NOT `makeOptionalCurrencySchema` though: that factory's 99,999.99 ceiling
 * doesn't exist on the backend (`insurance.py` — `ge=0`, no `le`), and
 * insurance is THE #140 form, so a client-side cap here would reject
 * legitimate values (a high-value collector-car policy, a commercial umbrella
 * premium) the API accepts. Bespoke min:0/max:Infinity via the exported
 * `makeNumericField`, same technique as `warranty.mileage_limit_km`.
 */
export const makeInsuranceSchema = (t: TFunction) =>
  z.object({
    provider: z.string().min(1, t('common:validation.provider.required')),
    policy_number: z.string().min(1, t('common:validation.policyNumber.required')),
    policy_type: z.string().min(1, t('common:validation.policyType.required')),
    start_date: z.string().min(1, t('common:validation.date.required')),
    end_date: z.string().min(1, t('common:validation.date.required')),
    premium_amount: makeNumericField(t, {
      min: 0,
      max: Infinity,
      negativeKey: 'common:validation.amount.negative',
      tooLargeKey: 'common:validation.amount.tooLarge',
      invalidKey: 'common:validation.amount.invalid',
    }),
    premium_frequency: z.string().optional(),
    deductible: makeNumericField(t, {
      min: 0,
      max: Infinity,
      negativeKey: 'common:validation.amount.negative',
      tooLargeKey: 'common:validation.amount.tooLarge',
      invalidKey: 'common:validation.amount.invalid',
    }),
    coverage_limits: z.string().optional(),
    notes: z.string().optional(),
  })

// premium_amount/deductible are `unknown` going in (raw NumberInput text or a
// number from defaultValues) and `number | undefined` coming out — the
// resolver is cast to the output type at the call site (see InsuranceForm),
// matching the sibling record forms built on the same shared.ts factories.
export type InsuranceFormData = z.output<ReturnType<typeof makeInsuranceSchema>>
