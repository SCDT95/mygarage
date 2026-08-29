/**
 * The instance-wide default unit set, as published to clients with no user.
 *
 * Anonymous visitors and every client on an `auth_mode=none` instance skip
 * `/auth/me`, so they have no account to resolve units from (spec D5). The
 * backend has published a full resolved set for them in `/settings/public`
 * since phase 1 (`app/routes/settings.py`, key `default_unit_prefs`); the
 * frontend read `auth_mode` out of that payload and discarded the rest, so an
 * anonymous visitor on a metric-default instance rendered IMPERIAL no matter
 * what the admin had configured.
 *
 * The row's value is a JSON STRING, not a nested object: both writers
 * (`app/migrations/093_add_unit_preferences.py` and
 * `app/services/settings_init.py`) store `json.dumps(unit_set.model_dump(),
 * sort_keys=True)` and the route hands that string back untouched.
 *
 * Parsing degrades WHOLE, mirroring `app/utils/default_unit_prefs.py`: a
 * partial or out-of-vocabulary set yields `null` rather than being patched
 * field by field, because filling the gaps from an imperial default would hand
 * a metric instance imperial pressure. `null` means "this rung has no answer",
 * and the caller drops to the next one.
 */

import type { UnitSet } from '@/types/units'
import type { GallonStandard } from '@/utils/units'

/** The settings key the backend publishes the default set under. */
export const DEFAULT_UNIT_PREFS_KEY = 'default_unit_prefs'

/** One row of the `/settings/public` payload. */
export interface PublicSetting {
  key: string
  value?: string | null
}

/**
 * The accepted token for every quantity, mirroring `app/constants/units.py`.
 *
 * `satisfies` makes the compiler reject a missing quantity and an unknown
 * token; `VOCABULARY_IS_COMPLETE` below rejects a missing token, which
 * `satisfies` alone cannot see.
 */
const UNIT_VOCABULARY = {
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
type MissingVocabularyToken = {
  [K in keyof UnitSet]: Exclude<UnitSet[K], (typeof UNIT_VOCABULARY)[K][number]>
}[keyof UnitSet]

/**
 * Compile-time proof that the table lists every token of every quantity.
 *
 * An omitted token would make a perfectly valid server default unparseable and
 * silently drop the client to the legacy localStorage keys, which is the exact
 * failure this module exists to end. The declared type collapses to `false` the
 * moment a token goes missing, and this assignment stops compiling.
 */
export const VOCABULARY_IS_COMPLETE: [MissingVocabularyToken] extends [never] ? true : false = true

const UNIT_FIELD_NAMES = Object.keys(UNIT_VOCABULARY) as Array<keyof UnitSet>

/**
 * Parse a stored unit set, or return null if it is not a complete, in-vocabulary one.
 *
 * @param raw The settings row's value, as served.
 * @returns The resolved set, or null when there is nothing trustworthy to use.
 */
export function parseUnitSet(raw: string | null | undefined): UnitSet | null {
  if (!raw) return null

  const payload = tryParseJson(raw)
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null

  const candidate = payload as Record<string, unknown>
  // Arity first: this plus the per-field check below is the frontend's
  // equivalent of the model's `extra="forbid"` with every field required. An
  // unknown key means the writer and the reader disagree about the shape.
  if (Object.keys(candidate).length !== UNIT_FIELD_NAMES.length) return null

  for (const field of UNIT_FIELD_NAMES) {
    const value = candidate[field]
    const vocabulary: readonly string[] = UNIT_VOCABULARY[field]
    if (typeof value !== 'string' || !vocabulary.includes(value)) return null
  }

  return candidate as UnitSet
}

/**
 * Find the default unit set in a `/settings/public` payload.
 *
 * @param settings The payload's `settings` array, which may be absent.
 * @returns The resolved set, or null when the instance published none this
 *   client can use.
 */
export function readPublicUnitDefaults(
  settings: readonly PublicSetting[] | null | undefined
): UnitSet | null {
  const row = (settings ?? []).find((setting) => setting.key === DEFAULT_UNIT_PREFS_KEY)
  return parseUnitSet(row?.value)
}

/**
 * The gallon flavour a resolved set implies (D4b).
 *
 * Mirrors `app/utils/unit_formatting.py::_forced_gallon_token`: a `gal_us` or
 * `gal_uk` primary states its own flavour and wins outright even when
 * `secondary_gallon` disagrees. Only a litre primary, which has no flavour of
 * its own, defers to `secondary_gallon`.
 *
 * @param units A resolved unit set.
 * @returns The gallon standard to convert and label with.
 */
export function gallonStandardFor(units: UnitSet): GallonStandard {
  // units-exempt(token-branch): R1's structural exemption in its other spelling. The gallon FLAVOUR is a choice BETWEEN units with no quantity to convert, which is why UNIT_QUANTITIES excludes `secondary_gallon` behind a compile-time completeness proof; this reads `units.volume` because a gallon primary states its own flavour and D4b says it wins. Not deferred work.
  if (units.volume === 'gal_uk') return 'uk'
  // units-exempt(token-branch): the second half of the same rule, and it needs its own pragma because the hatch covers a line and the one above it, so a pair of comparisons on consecutive lines is a pair of sites.
  if (units.volume === 'gal_us') return 'us'
  return units.secondary_gallon
}

/**
 * JSON.parse without the throw.
 *
 * @param raw Candidate JSON text.
 * @returns The parsed value, or null when it is not JSON at all.
 */
function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
