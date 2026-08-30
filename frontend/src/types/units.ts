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
 * The accepted token for every quantity, mirroring `app/constants/units.py`.
 *
 * `satisfies` makes the compiler reject a missing quantity and an unknown
 * token; `UNIT_OPTIONS_ARE_COMPLETE` below rejects a missing token, which
 * `satisfies` alone cannot see.
 *
 * ★ This table used to live, unexported, inside `utils/publicUnitDefaults.ts`,
 * where the only reader was that module's own parser. Phase 4 gave it a second
 * reader (the browser preference store validates a stored set the same way) and
 * will give it a third (the eleven Custom controls need the options to offer),
 * so it moved to the module that owns the vocabulary rather than being copied.
 * A second copy of the unit vocabulary is how this workstream started.
 */
export const UNIT_OPTIONS = {
  distance: ['km', 'mi'],
  speed: ['kmh', 'mph'],
  length: ['m', 'ft'],
  volume: ['L', 'gal_us', 'gal_uk'],
  consumption: ['l_100km', 'km_l', 'mpg_us', 'mpg_uk'],
  pressure: ['kpa', 'bar', 'psi'],
  temperature: ['c', 'f'],
  mass: ['kg', 'lb'],
  torque: ['nm', 'lbft'],
  tread: ['mm', 'in32'],
  secondary_gallon: ['us', 'uk'],
} as const satisfies { readonly [K in keyof UnitSet]: readonly UnitSet[K][] }

/** Any token the generated `UnitSet` admits that the table above omits. */
type MissingUnitOption = {
  [K in keyof UnitSet]: Exclude<UnitSet[K], (typeof UNIT_OPTIONS)[K][number]>
}[keyof UnitSet]

/**
 * Compile-time proof that the table lists every token of every quantity.
 *
 * An omitted token would make a perfectly valid server default unparseable and
 * silently drop the client to the legacy localStorage keys, which is the exact
 * failure `publicUnitDefaults` exists to end. The declared type collapses to
 * `false` the moment a token goes missing, and this assignment stops compiling.
 */
export const UNIT_OPTIONS_ARE_COMPLETE: [MissingUnitOption] extends [never] ? true : false = true

/** Every field of a `UnitSet`, derived from the vocabulary rather than listed. */
export const UNIT_FIELD_NAMES = Object.keys(UNIT_OPTIONS) as Array<keyof UnitSet>

/**
 * Read an untrusted value as a complete, in-vocabulary `UnitSet`.
 *
 * Degrades WHOLE, mirroring `app/utils/default_unit_prefs.py`: a partial or
 * out-of-vocabulary set yields `null` rather than being patched field by field,
 * because filling the gaps from an imperial default would hand a metric client
 * imperial pressure. `null` means "there is nothing trustworthy here", and the
 * caller drops to whatever it has next.
 *
 * @param value A parsed candidate, from a settings row or from browser storage.
 * @returns The resolved set, or null when it is not a complete, valid one.
 */
export function coerceUnitSet(value: unknown): UnitSet | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null

  const candidate = value as Record<string, unknown>
  // Arity first: this plus the per-field check below is the frontend's
  // equivalent of the model's `extra="forbid"` with every field required. An
  // unknown key means the writer and the reader disagree about the shape.
  if (Object.keys(candidate).length !== UNIT_FIELD_NAMES.length) return null

  for (const field of UNIT_FIELD_NAMES) {
    const token = candidate[field]
    const vocabulary: readonly string[] = UNIT_OPTIONS[field]
    if (typeof token !== 'string' || !vocabulary.includes(token)) return null
  }

  return candidate as UnitSet
}

/**
 * Collapse a resolved volume unit to the binary system the older helpers expect.
 *
 * Spec D8: a `custom` user still has to give `supplyUnits` and every other
 * binary consumer a defined answer, and the resolved volume unit is what
 * supplies it. Any gallon is imperial; litres are metric.
 */
export function binarySystemFor(volume: VolumeUnit): 'metric' | 'imperial' {
  // units-exempt(token-branch): D8's single admitted collapse, and the token read IS the quantity being asked about rather than a proxy for another one. Not deferred work: while any binary consumer survives, one of them has to be given a defined answer, and concentrating the collapse in one exported function is what makes the population countable. Kind-scoped, so a comparison of a DIFFERENT quantity added to this line would still be reported.
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
