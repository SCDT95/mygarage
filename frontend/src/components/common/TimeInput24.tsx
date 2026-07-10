/**
 * Controlled 24-hour time input (HH:MM).
 *
 * The native <input type="time"> / "datetime-local" widgets render 12- or
 * 24-hour based on the browser locale, with no attribute to force 24h — which
 * caused inconsistent entry (issue #109). This text input always interprets
 * and displays time in unambiguous 24-hour form.
 *
 * The parent owns the raw text (onChange fires on every keystroke) so the
 * value at submit time never depends on blur/Enter having fired. Blur only
 * tidies the display. `normalizeTime` is exported so the parent can recompute
 * the canonical value authoritatively at submit.
 */
import { type ReactElement, useEffect, useState } from 'react'

interface TimeInput24Props {
  id: string
  ariaLabel: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
}

const DEFAULT_CLASS =
  'w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-garage-bg text-garage-text border-garage-border'

/** Normalize free text to "HH:MM" (24h) or "" when empty/unparseable. */
export function normalizeTime(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') return ''

  let hh: number
  let mm: number
  const colon = trimmed.match(/^(\d{1,2}):(\d{1,2})$/)
  if (colon) {
    hh = Number(colon[1])
    mm = Number(colon[2])
  } else if (/^\d{3,4}$/.test(trimmed)) {
    const digits = trimmed.padStart(4, '0')
    hh = Number(digits.slice(0, 2))
    mm = Number(digits.slice(2))
  } else if (/^\d{1,2}$/.test(trimmed)) {
    hh = Number(trimmed)
    mm = 0
  } else {
    return ''
  }

  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return ''
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export default function TimeInput24({
  id,
  ariaLabel,
  value,
  onChange,
  disabled,
  className,
}: TimeInput24Props): ReactElement {
  const [text, setText] = useState(value)

  // Keep local text in sync when the parent value changes (e.g. edit-seed).
  useEffect(() => {
    setText(value)
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setText(e.target.value)
    onChange(e.target.value) // raw — parent stays current before blur/submit
  }

  const handleBlur = (): void => {
    const trimmed = text.trim()
    if (trimmed === '') {
      setText('')
      onChange('')
      return
    }
    const normalized = normalizeTime(text)
    if (normalized) {
      setText(normalized) // tidy a valid value to HH:MM
      onChange(normalized)
    }
    // Invalid but non-empty (e.g. "25:00", "2:"): KEEP the raw text — do NOT
    // clear to "". Clearing would let a later submit see empty and send
    // filled_at=null, erasing an existing timestamp (Codex R1-H1). Per-keystroke
    // onChange already gave the parent the raw text, so submit-time validation
    // blocks on it.
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      id={id}
      aria-label={ariaLabel}
      value={text}
      placeholder="HH:MM"
      disabled={disabled}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className ?? DEFAULT_CLASS}
    />
  )
}
