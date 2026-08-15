import type { ComponentProps } from 'react'
import type {
  FieldPath,
  FieldValues,
  RegisterOptions,
  UseFormRegister,
  UseFormRegisterReturn,
} from 'react-hook-form'
import Input from './Input'
import { getActiveLocale } from '@/constants/i18n'
import { parseDecimalInput } from '@/utils/decimalInput'
import { INVALID_NUMBER } from '@/schemas/shared'

interface NumberInputProps extends Omit<ComponentProps<typeof Input>, 'type' | 'inputMode'> {
  /**
   * Shown under the control when the typed value had two legal readings.
   *
   * Currently unwired: no consumer passes this prop, and `registerDecimal`
   * below discards the `ambiguous` flag it computes. Wiring it for real needs
   * a `watch` + re-parse in the consuming form's render, which is real work
   * (final-review I7). The plumbing (this prop, its aria-describedby
   * composition) is left in place for that future task.
   */
  ambiguityHint?: string
}

/**
 * Register a numeric field so the raw text is parsed with the locale-aware rule
 * instead of the browser's `valueAsNumber`.
 *
 * `valueAsNumber` accepts only a dot and yields NaN otherwise, which the schema
 * layer swallowed as "empty". This routes the field through parseDecimalInput
 * and emits a sentinel the schema rejects.
 *
 * `options` passes through any other RHF rules — SupplyHistoryModal keeps
 * `required` inside `register` (no zod resolver on those two inline forms),
 * and dropping it would delete real validation.
 *
 * `min`/`max` are excluded from `options` on purpose, not just left
 * undocumented: RHF's native min/max check (`validateField`) coerces the
 * field value with unary `+` to compare it, which throws a TypeError on the
 * `INVALID_NUMBER` symbol this function can emit for unparseable text — this
 * is exactly what happened to SupplyHistoryModal's `quantity`/`total_cost`
 * fields before they were moved to an equivalent `validate` function instead.
 * On a resolver-based form `min`/`max` here would be silently inert anyway
 * (RHF skips `validateField` entirely whenever a `resolver` is configured),
 * so there's no case where passing them helps — better a compile error than
 * either dead code or a stack trace.
 */
export function registerDecimal<T extends FieldValues>(
  register: UseFormRegister<T>,
  name: FieldPath<T>,
  options?: Omit<RegisterOptions<T, FieldPath<T>>, 'setValueAs' | 'valueAsNumber' | 'valueAsDate' | 'min' | 'max'>
): UseFormRegisterReturn {
  return register(name, {
    ...options,
    setValueAs: (raw: unknown) => {
      // Edit mode supplies a number from defaultValues; never re-parse it as text.
      if (typeof raw === 'number') return raw
      const result = parseDecimalInput(String(raw ?? ''), getActiveLocale())
      if (result.kind === 'empty') return undefined
      if (result.kind === 'invalid') return INVALID_NUMBER
      // `result.ambiguous` is computed (true when both separator readings are
      // legal, e.g. "1.234" read as thousands-grouped vs. decimal) but
      // discarded here — no caller currently threads it into `ambiguityHint`
      // below. Wiring it needs a `watch` + re-parse in render; left for a
      // future task (final-review I7 — see NumberInputProps.ambiguityHint).
      return result.value
    },
  })
}

/**
 * Text input for decimals.
 *
 * Deliberately NOT `type="number"`: that clears its own value when the content
 * is unparseable, so the user's separator never reaches the handler.
 * `inputMode="decimal"` keeps the numeric keypad on mobile.
 */
export default function NumberInput({
  mono = true,
  ambiguityHint,
  id,
  'aria-describedby': ariaDescribedBy,
  ...rest
}: NumberInputProps) {
  const hintId = ambiguityHint && id ? `${id}-ambiguity` : undefined
  return (
    <>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        mono={mono}
        aria-describedby={[ariaDescribedBy, hintId].filter(Boolean).join(' ') || undefined}
        {...rest}
      />
      {ambiguityHint ? (
        <p id={hintId} className="mt-1 text-xs text-text-mute">
          {ambiguityHint}
        </p>
      ) : null}
    </>
  )
}
