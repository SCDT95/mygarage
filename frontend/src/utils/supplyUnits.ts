/**
 * Supplies are measured in litres or in whole items, and D8 exempts the quart
 * conversion below from the adapter table.
 *
 * ★ The TYPE is not exempt, and used to be declared here as a second
 * `'metric' | 'imperial'` union structurally identical to `utils/units.ts`'s.
 * TypeScript compares unions structurally, so `tsc` could never see the two
 * drift apart, and they did: when the API-level preference union was widened
 * to admit `'custom'`, one copy was updated and this one silently was not.
 * There is one `UnitSystem` declaration in the codebase now and one place to
 * import it from, so widening it reaches every consumer of both. It is
 * deliberately NOT re-exported from here: a second import path is how the
 * second declaration would come back.
 */
import type { UnitSystem } from './units'

export type SupplyUnitType = 'volume' | 'count'

const L_PER_QUART = 0.946352946

/** Convert a canonical value (L for volume, count for count) to the user's display unit. */
export function canonicalToDisplay(
  value: number,
  unitType: SupplyUnitType,
  system: UnitSystem,
): number {
  if (unitType === 'count' || system === 'metric') return value
  return value / L_PER_QUART // liters → quarts
}

/** Convert a user-entered display value back to canonical (L / count). */
export function displayToCanonical(
  value: number,
  unitType: SupplyUnitType,
  system: UnitSystem,
): number {
  if (unitType === 'count' || system === 'metric') return value
  return value * L_PER_QUART // quarts → liters
}

/** Unit label for display. */
export function supplyUnitLabel(unitType: SupplyUnitType, system: UnitSystem): string {
  if (unitType === 'count') return ''
  return system === 'imperial' ? 'qt' : 'L'
}
