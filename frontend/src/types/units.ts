/**
 * Unit preference types, re-exported from the generated OpenAPI schema.
 *
 * Nothing here is hand-maintained. `AuthContext` used to declare its own
 * `unit_preference?: 'imperial' | 'metric'`, which the API freshness gate
 * cannot see: regenerating the schema passed while that union went stale, and
 * migration 093 can now write a third value it never admitted.
 */

import type { components } from './api.generated'

export type UnitSet = components['schemas']['UnitSet']
export type UnitPreference = components['schemas']['UserResponse']['unit_preference']

export type VolumeUnit = UnitSet['volume']

/**
 * Collapse a resolved volume unit to the binary system the older helpers expect.
 *
 * Spec D8: a `custom` user still has to give `supplyUnits` and every other
 * binary consumer a defined answer, and the resolved volume unit is what
 * supplies it. Any gallon is imperial; litres are metric.
 */
export function binarySystemFor(volume: VolumeUnit): 'metric' | 'imperial' {
  return volume === 'L' ? 'metric' : 'imperial'
}

/**
 * The ten convertible quantities, in the order `UnitSet` declares them.
 *
 * `secondary_gallon` is deliberately absent: it is D4b's flavour hint for a
 * primary that cannot state its own gallon, not a quantity anything converts.
 * Asking for an adapter for it would be a bug, so the type forbids it.
 */
export type UnitQuantity = Exclude<keyof UnitSet, 'secondary_gallon'>

/**
 * The quantity names, as a value.
 *
 * `satisfies` rejects a name that is not a quantity; `UNIT_QUANTITIES_ARE_COMPLETE`
 * below rejects a quantity this list forgets, which `satisfies` alone cannot
 * see. Same two-sided proof `publicUnitDefaults.ts` uses for the vocabulary.
 */
export const UNIT_QUANTITIES = [
  'distance',
  'speed',
  'length',
  'volume',
  'consumption',
  'pressure',
  'temperature',
  'mass',
  'torque',
  'tread',
] as const satisfies readonly UnitQuantity[]

/** Any quantity the list above omits. */
type MissingQuantity = Exclude<UnitQuantity, (typeof UNIT_QUANTITIES)[number]>

/**
 * Compile-time proof that the list names every quantity.
 *
 * A forgotten quantity would give `makeUnitFormat` a hole rather than an error:
 * the returned record's type would still claim the key exists, and the call site
 * would read `undefined.label` at runtime. The declared type collapses to
 * `false` the moment one goes missing, and this assignment stops compiling.
 */
export const UNIT_QUANTITIES_ARE_COMPLETE: [MissingQuantity] extends [never] ? true : false = true

/** The gallon flavour a browser holds, as `UnitSet` spells it. */
type GallonFlavour = UnitSet['secondary_gallon']

/**
 * The four preset unit sets, mirroring `app/constants/units.py`'s
 * `METRIC_PRESET` / `IMPERIAL_PRESET` and `app/utils/default_unit_prefs.py`'s
 * `UK_IMPERIAL_PRESET` (the imperial preset with volume, consumption and
 * secondary_gallon replaced).
 *
 * Frozen module constants rather than objects built per call, so a hook that
 * memoizes on the resolved set does not recompute on every render.
 */
const UNIT_PRESETS: Readonly<Record<'imperial' | 'metric', Readonly<Record<GallonFlavour, UnitSet>>>> =
  {
    imperial: {
      us: {
        distance: 'mi',
        speed: 'mph',
        length: 'ft',
        volume: 'gal_us',
        consumption: 'mpg_us',
        pressure: 'psi',
        temperature: 'f',
        mass: 'lb',
        torque: 'lbft',
        tread: 'in32',
        secondary_gallon: 'us',
      },
      uk: {
        distance: 'mi',
        speed: 'mph',
        length: 'ft',
        volume: 'gal_uk',
        consumption: 'mpg_uk',
        pressure: 'psi',
        temperature: 'f',
        mass: 'lb',
        torque: 'lbft',
        tread: 'in32',
        secondary_gallon: 'uk',
      },
    },
    metric: {
      us: {
        distance: 'km',
        speed: 'kmh',
        length: 'm',
        volume: 'L',
        consumption: 'l_100km',
        pressure: 'kpa',
        temperature: 'c',
        mass: 'kg',
        torque: 'nm',
        tread: 'mm',
        secondary_gallon: 'us',
      },
      uk: {
        distance: 'km',
        speed: 'kmh',
        length: 'm',
        volume: 'L',
        consumption: 'l_100km',
        pressure: 'kpa',
        temperature: 'c',
        mass: 'kg',
        torque: 'nm',
        tread: 'mm',
        secondary_gallon: 'uk',
      },
    },
  }

/**
 * Expand a binary system plus a gallon flavour into a full resolved set.
 *
 * Two rungs of `useUnitPreference` hold exactly that pair and no resolved set:
 * an explicit anonymous choice (the `unit_preference` key plus the browser's
 * cached gallon standard) and the post-093 fallback. Both still have to hand
 * `useUnitFormat` a complete `UnitSet`, and inventing one at the call site is
 * how a fourth copy of the preset table would appear.
 *
 * @param system The binary unit system the client resolved to.
 * @param gallonStandard The gallon flavour the browser holds.
 * @returns The matching preset. The same object every time, per pair.
 */
export function presetUnitsFor(
  system: 'metric' | 'imperial',
  gallonStandard: GallonFlavour
): UnitSet {
  return UNIT_PRESETS[system][gallonStandard]
}
