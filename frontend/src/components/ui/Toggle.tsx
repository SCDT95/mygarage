import { useId } from 'react'

interface ToggleProps {
  id?: string
  /** Already translated by the caller. Becomes the accessible name. */
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  /** Hide the visible label when the surrounding row already names the
   *  control. The accessible name is preserved via aria-label. */
  hideLabel?: boolean
}

/**
 * A single on/off setting, drawn as a switch but built on a real
 * <input type="checkbox">.
 *
 * One treatment app-wide: the accent colour when on, red when off — off is a
 * deliberate, visible "excluded" state, not a neutral grey (product decision
 * 2026-08-01). The custom switch in VehicleTransferWizard follows the same
 * on/off colours by hand.
 *
 * NO role="switch". Five existing tests query getByRole('checkbox', …) on
 * controls this replaces, and role="switch" would break every one of them for
 * no user-visible gain — a styled checkbox input is fully accessible.
 *
 * And no explicit role="checkbox" either: <input type="checkbox"> already has
 * that implicit role, so spelling it out adds nothing an AT can use and one
 * more thing that can drift out of sync with the element.
 *
 * Modelled on LiveLinkTripsTab.tsx:128-146, the only one of the three
 * existing toggle implementations that carries any ARIA at all.
 */
export default function Toggle({
  id,
  label,
  checked,
  onChange,
  disabled = false,
  hideLabel = false,
}: ToggleProps) {
  const fallbackId = useId()
  const inputId = id ?? fallbackId

  const trackOn = 'bg-(--accent-solid)'
  const trackOff = 'bg-danger'

  return (
    <label
      htmlFor={inputId}
      data-testid="toggle"
      className={`flex items-center gap-3 text-sm text-text ${
        disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'
      }`}
    >
      <span className="relative inline-flex shrink-0">
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={hideLabel ? label : undefined}
          // Visually replaced by the track+knob below, but kept in the layout
          // and hit-testable so it stays a real, focusable, clickable control.
          // Cursor tracks `disabled` too — this is the actual hit target
          // (the spans above it are pointer-events-none), so an unconditional
          // cursor-pointer here would show a pointer over a disabled toggle
          // even though the wrapping <label> switches to not-allowed.
          className={`peer h-6 w-11 appearance-none rounded-pill ${
            disabled ? 'cursor-not-allowed' : 'cursor-pointer'
          }`}
        />
        <span
          aria-hidden="true"
          className={`ui-motion-toggle pointer-events-none absolute inset-0 rounded-pill ${
            checked ? trackOn : trackOff
          } peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--accent)`}
        />
        <span
          aria-hidden="true"
          className={`ui-motion-toggle pointer-events-none absolute top-0.5 h-5 w-5 rounded-full bg-toggle-knob ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </span>
      {hideLabel ? null : label}
    </label>
  )
}
