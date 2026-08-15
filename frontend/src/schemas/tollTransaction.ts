import { z } from 'zod'
import type { TFunction } from 'i18next'
import { makeOptionalCurrencySchema } from './shared'

const tollTagIdSchema = z
  .number()
  .or(z.nan())
  .transform(val => isNaN(val) ? undefined : val)
  .optional()

/**
 * Factory, not a constant — `amount` routes through `makeOptionalCurrencySchema`,
 * which needs `t` for its translated messages (see schemas/auth.ts header for why
 * every validator here is a factory).
 *
 * `amount` moved onto `NumberInput`/`registerDecimal` (Task 8), so it can now
 * carry the `INVALID_NUMBER` sentinel for unparseable text, not just `number` /
 * `NaN`. The old `z.number().min(0,...).or(z.nan())` shape only recognized
 * those two, so a sentinel failed BOTH union branches and zod reported its
 * generic "Invalid input: expected number, received symbol" — a raw internal
 * leak, not a translated message. `toll_tag_id` stays on the old shape
 * deliberately: its <Select> only ever emits a numeric string or '', which
 * `valueAsNumber` still turns into a number or NaN, never the sentinel.
 */
export const makeTollTransactionSchema = (t: TFunction) =>
  z.object({
    transaction_date: z.string().min(1, 'Transaction date is required'),
    amount: makeOptionalCurrencySchema(t),
    location: z.string().min(1, 'Location is required'),
    toll_tag_id: tollTagIdSchema,
    notes: z.string().optional(),
  })

export type TollTransactionInput = z.input<ReturnType<typeof makeTollTransactionSchema>>
export type TollTransactionFormData = z.output<ReturnType<typeof makeTollTransactionSchema>>
