import { z } from 'zod'
import type { TFunction } from 'i18next'

import {
  makeDateSchema,
  makeNotesSchema,
  makeOptionalCurrencySchema,
  makeOptionalVolumeSchema,
  makeOptionalOdometerSchema,
  makeOptionalPricePerUnitSchema,
  makeNumericField,
} from './shared'

/**
 * DEF record schema matching backend Pydantic validators.
 * See: backend/app/schemas/def_record.py
 *
 * Factory, not a constant — see the header of schemas/auth.ts for why.
 *
 * Task 8 moved fill_level onto NumberInput/registerDecimal, which can hand
 * this schema the INVALID_NUMBER sentinel for unparseable text — the old
 * `.or(z.nan())` shape only recognized number/NaN, so a sentinel failed the
 * union and zod reported its raw "expected number, received symbol" instead
 * of a translated message. Routed through the shared makeNumericField,
 * preserving the exact 0-100 bound. FuelRecordForm's def_fill_level is the
 * same percentage concept and reuses these same three keys.
 */

export const makeDefRecordSchema = (t: TFunction) =>
  z.object({
    date: makeDateSchema(t),
    odometer_km: makeOptionalOdometerSchema(t),
    liters: makeOptionalVolumeSchema(t),
    price_per_unit: makeOptionalPricePerUnitSchema(t),
    cost: makeOptionalCurrencySchema(t),
    fill_level: makeNumericField(t, {
      min: 0,
      max: 100,
      negativeKey: 'common:validation.def.fillLevelNegative',
      tooLargeKey: 'common:validation.def.fillLevelTooLarge',
      invalidKey: 'common:validation.def.fillLevelInvalid',
    }),
    source: z.string().max(100).optional(),
    brand: z.string().max(100).optional(),
    notes: makeNotesSchema(t).optional(),
  })

export type DefRecordFormData = z.infer<ReturnType<typeof makeDefRecordSchema>>
