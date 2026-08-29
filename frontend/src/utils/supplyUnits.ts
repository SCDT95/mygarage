/**
 * Supplies are measured in litres or in whole items, and D8 exempts the quart
 * conversion below from the adapter table.
 *
 * ★ RULING R3, and the premise all three comparisons below rest on. D8 exempts
 * the quart CONVERSION; it says nothing about whether these comparisons may
 * read a collapsed `system`, so each one is ruled separately at its own site.
 *
 * The premise they share: `system` is NOT lossy with respect to the quantity
 * these functions decide. Every caller reads it from `useUnitPreference()`
 * (`SupplyHistoryModal`, `SupplyUsedPicker`, `SuppliesUsedTab`,
 * `ServiceVisitForm`, `pages/Supplies`, and no other file calls into here),
 * and on all four of that hook's rungs `system === binarySystemFor(units.volume)`.
 * That is not prose: `hooks/__tests__/useUnitPreference.precedence.test.tsx`
 * asserts it rung by rung, and `types/units.ts:binarySystemFor` is
 * `volume === 'L' ? 'metric' : 'imperial'`. Supplies are a VOLUME quantity, so
 * every comparison below is the volume token under another name.
 *
 * That is what makes these different from the phase's signature defect. A
 * `{volume:'L', distance:'mi'}` user gets `system === 'metric'` and litres of
 * oil, which is right; the same collapse is wrong in `toCanonicalKm` only
 * because DISTANCE is not the quantity the collapse was taken over.
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

/**
 * Convert a canonical value (L for volume, count for count) to the user's display unit.
 *
 * R3 ruling, READ leg: EXEMPT. `units.volume` is the only field of a resolved
 * set that can change this answer, and the header's invariant says `system`
 * carries it whole. Rewriting the test as `units.volume === 'L'` would select
 * the same branch for every set the client can hold, so the migration would be
 * churn rather than a fix.
 */
export function canonicalToDisplay(
  value: number,
  unitType: SupplyUnitType,
  system: UnitSystem,
): number {
  // units-exempt: R3 read leg. `system` is `binarySystemFor(units.volume)` on every rung of useUnitPreference, and volume is the quantity supplies measure, so this comparison already IS the resolved token.
  if (unitType === 'count' || system === 'metric') return value
  return value / L_PER_QUART // liters → quarts
}

/**
 * Convert a user-entered display value back to canonical (L / count).
 *
 * R3 ruling, WRITE leg: EXEMPT, and exempt as a PAIR with `canonicalToDisplay`
 * rather than on its own. This is the only function here that reaches storage,
 * so it is the one a wrong answer would make permanent; it is safe for exactly
 * the reason the read leg is, and its condition is character-identical on
 * purpose. Migrating either leg alone would be the real hazard: a stored litre
 * read back through a differently-conditioned display is a silent 5.7 percent
 * per round trip, so if these ever move they move in the same commit.
 */
export function displayToCanonical(
  value: number,
  unitType: SupplyUnitType,
  system: UnitSystem,
): number {
  // units-exempt: R3 write leg. Same premise as the read leg, and character-identical to it on purpose: these two are exempt as a pair or not at all.
  if (unitType === 'count' || system === 'metric') return value
  return value * L_PER_QUART // quarts → liters
}

/**
 * Unit label for display.
 *
 * R3 ruling, LABEL leg: EXEMPT on the mixed-set test, with one defect recorded
 * that the migration would NOT fix. No mixed set reaches a different label than
 * the volume token alone would, so the header's invariant covers it.
 *
 * ★ What it does collapse is `gal_uk` onto `gal_us`: both answer 'imperial',
 * both get 'qt', and `L_PER_QUART` is the US liquid quart. A UK user entering
 * one quart of oil therefore stores 0.946 L where they meant 1.137, the same
 * 20.1 percent and the same shape as defect L1. Reading `units.volume` instead
 * does not fix it, because `UnitSet` has no quart token to resolve to: quarts
 * are D8's own choice of display unit, outside the resolved vocabulary
 * entirely. Fixing it means giving D8 a UK quart and restating the supplies
 * already stored under the US one, which is a spec amendment and a data
 * question, not a comparison this file can rewrite.
 */
export function supplyUnitLabel(unitType: SupplyUnitType, system: UnitSystem): string {
  if (unitType === 'count') return ''
  // units-exempt: R3 label leg. No mixed set reaches a different label than units.volume alone would; the gal_uk/gal_us collapse it does carry is D8's quart choice, which reading `units` would not fix.
  return system === 'imperial' ? 'qt' : 'L'
}
