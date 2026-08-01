/** Classes that make an info Card read as a single click-to-edit target:
 *  positioning context for the overlay below, plus the hover/focus cues. */
export const EDITABLE_CARD_CLASS =
  'relative cursor-pointer ui-motion ui-hover-line hover:shadow-card-hover'

interface CardEditOverlayProps {
  /** Accessible name for the edit action, already translated. */
  label: string
  onClick: () => void
}

/**
 * Transparent full-card overlay button that turns an info Card into one
 * click-to-edit target without collapsing its content into a button label.
 *
 * The parent Card must carry EDITABLE_CARD_CLASS (for `position: relative`) and
 * contain no other interactive elements — the overlay sits above everything.
 * Mouse users click anywhere on the card; keyboard/AT users reach this button;
 * the values underneath stay real, screen-reader-readable content.
 */
export default function CardEditOverlay({ label, onClick }: CardEditOverlayProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="ui-focus-ring absolute inset-0 z-10 rounded-card cursor-pointer"
    />
  )
}
