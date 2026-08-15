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
  /** Shown under the control when the typed value had two legal readings. */
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
 * `options` passes through any other RHF rules. SupplyHistoryModal keeps
 * `required` and `min` inside `register`, and dropping them would delete real
 * validation.
 */
export function registerDecimal<T extends FieldValues>(
  register: UseFormRegister<T>,
  name: FieldPath<T>,
  options?: Omit<RegisterOptions<T, FieldPath<T>>, 'setValueAs' | 'valueAsNumber' | 'valueAsDate'>
): UseFormRegisterReturn {
  return register(name, {
    ...options,
    setValueAs: (raw: unknown) => {
      // Edit mode supplies a number from defaultValues; never re-parse it as text.
      if (typeof raw === 'number') return raw
      const result = parseDecimalInput(String(raw ?? ''), getActiveLocale())
      if (result.kind === 'empty') return undefined
      if (result.kind === 'invalid') return INVALID_NUMBER
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
export default function NumberInput({ mono = true, ambiguityHint, id, ...rest }: NumberInputProps) {
  return (
    <>
      <Input id={id} type="text" inputMode="decimal" mono={mono} {...rest} />
      {ambiguityHint ? (
        <p id={id ? `${id}-ambiguity` : undefined} className="mt-1 text-xs text-text-mute">
          {ambiguityHint}
        </p>
      ) : null}
    </>
  )
}
