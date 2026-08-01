/**
 * Small form-value coercion helpers shared by the vehicle-detail edit sidecars
 * (PricingDrawer, VehicleFieldsDrawer). Kept as one place so the empty→null and
 * value→string rules can't drift between the drawers.
 */

/** Coerce any value to a display string; null/undefined become empty. */
export const str = (value: unknown): string => (value == null ? '' : String(value))

/** Like `str`, but clamps to a YYYY-MM-DD `<input type="date">` value,
 *  tolerating a full ISO timestamp. */
export const dateStr = (value: unknown): string => (value == null ? '' : String(value).slice(0, 10))

/** Trim, then map a blank string to null (an unset field) for a partial PUT. */
export const emptyToNull = (value: string): string | null =>
  value.trim() === '' ? null : value.trim()
