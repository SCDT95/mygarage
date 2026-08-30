/**
 * The browser's own unit preferences, as a subscribable module store.
 *
 * A client with no account is not a client with no preference. Anonymous
 * visitors, and every client on an `auth_mode=none` instance, are exactly the
 * population that cannot use the account path, and until this store existed
 * they could hold `imperial | metric` and nothing else: one bit, where an
 * account holds eleven columns. The Custom controls phase 4 adds would have had
 * nowhere to persist for them.
 *
 * Modelled on `gallonStandardStore.ts`, the store idiom this codebase already
 * uses: a module-level `current`, a `Set` of listeners, and a synchronous read
 * at module load so the very first render already agrees with what is
 * persisted. Four things it does that the gallon store does not.
 *
 * 1. PARSE ONCE AND HOLD. `useSyncExternalStore` calls `getSnapshot` on every
 *    render and throws "The result of getSnapshot should be cached" if it is
 *    handed a fresh object each time, which is precisely what parsing JSON per
 *    read would do. `current` is the parsed object; only a write or a `storage`
 *    event replaces it.
 * 2. VALIDATE WHOLE. One out-of-vocabulary token discards the entire set
 *    (`coerceUnitSet`), mirroring `parse_default_unit_prefs` on the backend.
 *    Half a set puts the client on a silently different unit from the server.
 * 3. MIGRATE THE THREE LEGACY KEYS ONCE, guarded on THIS key being absent and
 *    never on a legacy key being present. `useGallonStandardSync` rewrites
 *    `imperial_gallon_standard` from the server on every boot for every client,
 *    so a presence-guarded migration re-runs forever and overwrites whatever
 *    the user chose after it first ran.
 * 4. LISTEN FOR `storage`, in the keyless-tolerant form `onStorage` explains.
 *
 * ★ WHY MIGRATION LOOKS AT `unit_preference` AND NOT AT THE OTHER TWO.
 * `unit_preference` is the only one of the three legacy keys that records a
 * user's actual choice of units; the other two are modifiers on it.
 * `imperial_gallon_standard` in particular is written for EVERY client on every
 * boot, chosen or not, so materialising a full set because that key exists
 * would invent an explicit browser preference that outranks the instance
 * default (`useUnitPreference` rung 2 over rung 3) and pin every such browser
 * to whatever the gallon key happened to say.
 *
 * ★ BUT A MODIFIER IS STILL A CHOICE. `show_both_units` is separately settable
 * today by a client with no account, and a browser that set only that has made
 * a real choice. So `StoredUnitPrefs` carries a NULLABLE `units`: a record with
 * `units: null` holds the modifiers and does not activate the units rung. The
 * alternative considered was keeping `show_both_units` on its own key, read
 * independently; one key won because both halves are then written atomically,
 * arrive together across tabs, and give phase 4's card a single thing to write.
 *
 * ★ THE LEGACY KEYS ARE NOT DELETED after migrating. `useGallonStandardSync`
 * still writes one of them until task 5, and a delete here would race that
 * write rather than tidy up after it.
 */

import {
  UNIT_FIELD_NAMES,
  binarySystemFor,
  coerceUnitSet,
  presetUnitsFor,
  type UnitPreference,
  type UnitSet,
} from '../types/units'
import type { GallonStandard, UnitSystem } from './units'

/** The key this store owns. */
const STORAGE_KEY = 'unit_prefs'

/** The pre-phase-4 keys, each retired by a later task in this phase. */
const LEGACY_SYSTEM_KEY = 'unit_preference'
const LEGACY_GALLON_KEY = 'imperial_gallon_standard'
const LEGACY_SHOW_BOTH_KEY = 'show_both_units'

/**
 * The gallon flavour the two canonical presets are written in.
 *
 * `METRIC_PRESET` and `IMPERIAL_PRESET` in `app/constants/units.py` both carry
 * `secondary_gallon='us'`, so a set expanded with the UK flavour is NOT the
 * preset its binary system names, and `tagFor` has to say so.
 */
const PRESET_GALLON_FLAVOUR: GallonStandard = 'us'

/**
 * What one browser holds.
 *
 * `units === null` means the browser holds modifiers only and has no units
 * choice, so `useUnitPreference` falls through to the instance default.
 * `unit_preference` is null in exactly that case and is otherwise DERIVED from
 * `units` by `tagFor`: it is on the type so a caller can read the tag back, not
 * so a caller can set it, and `setUnitPrefs` recomputes it. That is deliberate.
 * A stored tag and a stored set can disagree, and a card highlighting
 * "Imperial" over a set the client renders as UK gallons is the exact
 * dishonesty migration 093 fixed on the server side.
 */
export interface StoredUnitPrefs {
  units: UnitSet | null
  unit_preference: UnitPreference | null
  show_both_units: boolean
}

let current: StoredUnitPrefs | null = readPersisted()

const listeners = new Set<() => void>()

/**
 * Subscribe to preference changes, for `useSyncExternalStore`.
 *
 * @param listener Called after any write or cross-tab change.
 * @returns The unsubscribe function.
 */
export function subscribeToUnitPrefs(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * The current preferences.
 *
 * @returns The held record, or null when this browser holds nothing at all.
 *   The SAME object between changes, because `useSyncExternalStore` requires it.
 */
export function getUnitPrefs(): StoredUnitPrefs | null {
  return current
}

/** Server snapshot: no localStorage during SSR or prerender, so no preference. */
export function getUnitPrefsServerSnapshot(): StoredUnitPrefs | null {
  return null
}

/**
 * Replace the browser's preferences, persist them, and notify subscribers.
 *
 * @param prefs The set and modifiers to hold. Its `unit_preference` is ignored
 *   and recomputed from `units`, so the tag can never contradict the set.
 */
export function setUnitPrefs(prefs: StoredUnitPrefs): void {
  current = makePrefs(prefs.units, prefs.show_both_units)
  persist(current)
  for (const listener of listeners) listener()
}

/**
 * Build a record with the tag derived rather than trusted.
 *
 * @param units The resolved set, or null for a modifiers-only record.
 * @param showBoth Whether to render both systems.
 * @returns The record to hold.
 */
function makePrefs(units: UnitSet | null, showBoth: boolean): StoredUnitPrefs {
  return {
    units,
    unit_preference: units === null ? null : tagFor(units),
    show_both_units: showBoth,
  }
}

/**
 * Name a resolved set the way the settings card has to label it.
 *
 * A preset tag is a claim that the set IS that preset. Anything else is
 * `custom`, which is the same rule migration 093 applies when it retags a
 * UK-gallon imperial account (`093_add_unit_preferences.py`,
 * `_materialise_uk_imperial_users`). Deriving it rather than storing it means
 * the browser cannot end up in the state that migration existed to repair.
 *
 * @param units A resolved set.
 * @returns The preset it matches, or 'custom'.
 */
function tagFor(units: UnitSet): UnitPreference {
  const system = binarySystemFor(units.volume)
  return sameUnits(units, presetUnitsFor(system, PRESET_GALLON_FLAVOUR)) ? system : 'custom'
}

/**
 * Whether two resolved sets agree on every quantity.
 *
 * @param a One set.
 * @param b The other.
 * @returns True when every field matches.
 */
function sameUnits(a: UnitSet, b: UnitSet): boolean {
  return UNIT_FIELD_NAMES.every((field) => a[field] === b[field])
}

/**
 * Read what this browser holds, migrating off the legacy keys if it has not yet.
 *
 * @returns The held record, or null when the browser holds nothing usable.
 */
function readPersisted(): StoredUnitPrefs | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    // ★ The guard is the ABSENCE of this key, and nothing else. See the header.
    if (raw === null) return migrateLegacy()
    return coerceStored(tryParseJson(raw))
  } catch {
    // Private mode, or storage disabled entirely.
    return null
  }
}

/**
 * Read an untrusted stored record.
 *
 * Unknown keys are tolerated where a unit token is not: a newer tab adding a
 * modifier must not blank this tab's units, while an unreadable token means the
 * two disagree about what the set MEANS and the set is discarded whole.
 *
 * @param value A parsed candidate.
 * @returns The record, or null when it is not one this build can read.
 */
function coerceStored(value: unknown): StoredUnitPrefs | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null

  const candidate = value as Record<string, unknown>
  if (typeof candidate.show_both_units !== 'boolean') return null

  const rawUnits = candidate.units
  if (rawUnits === null || rawUnits === undefined) {
    return makePrefs(null, candidate.show_both_units)
  }

  const units = coerceUnitSet(rawUnits)
  if (units === null) return null
  return makePrefs(units, candidate.show_both_units)
}

/**
 * Fold the three legacy keys into one record, once.
 *
 * @returns The migrated record, persisted so this never runs again, or null
 *   when the browser held no choice of any kind to migrate.
 */
function migrateLegacy(): StoredUnitPrefs | null {
  const system = readLegacySystem()
  const showBoth = localStorage.getItem(LEGACY_SHOW_BOTH_KEY) === 'true'
  if (system === null && !showBoth) return null

  const gallonStandard: GallonStandard =
    localStorage.getItem(LEGACY_GALLON_KEY) === 'uk' ? 'uk' : 'us'
  const units = system === null ? null : presetUnitsFor(system, gallonStandard)

  const migrated = makePrefs(units, showBoth)
  persist(migrated)
  return migrated
}

/**
 * Read the legacy browser choice, if it holds one the app recognises.
 *
 * `localStorage.getItem('unit_preference') as UnitSystem` used to hand any
 * stored text straight back as a `UnitSystem`, a value the type says cannot
 * exist. A key the app cannot read is noise rather than a recorded choice.
 *
 * The `units-exempt` marker below is deliberate and is not deferred work: there
 * is no quantity here and nothing to convert, so `validate-units.ts` flags it
 * only because it is fail-closed on an operand whose provenance it cannot see.
 * It moved here with the read it excuses when `useUnitPreference` stopped doing
 * its own parsing; the count of exempt sites is unchanged.
 *
 * @returns The stored system, or null when the browser holds no usable choice.
 */
function readLegacySystem(): UnitSystem | null {
  const stored = localStorage.getItem(LEGACY_SYSTEM_KEY)
  // units-exempt(compare): validating parse of a stored string, not a display conversion.
  return stored === 'imperial' || stored === 'metric' ? stored : null
}

/**
 * Write the record out, tolerating a browser that refuses to store it.
 *
 * The derived tag is not persisted: it is a function of `units`, and a stored
 * copy is one more thing that can go stale against the set beside it.
 *
 * @param prefs The record to persist.
 */
function persist(prefs: StoredUnitPrefs): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ units: prefs.units, show_both_units: prefs.show_both_units })
    )
  } catch {
    // The value still applies for this session even if it cannot be persisted.
  }
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

/**
 * Re-read on a `storage` event, from another tab or from this one.
 *
 * ★ THE KEY TEST IS DELIBERATELY LENIENT. `SettingsSystemTab` fires
 * `window.dispatchEvent(new Event('storage'))` from three handlers today: a
 * synthetic `Event`, not a `StorageEvent`, with no `key` property at all. A
 * handler written `if (event.key !== STORAGE_KEY) return` discards every one of
 * them. The same lenience matches a real `StorageEvent` carrying `key === null`,
 * which is how a whole-store clear arrives.
 *
 * @param event The storage event, real or synthetic.
 */
function onStorage(event: StorageEvent): void {
  if (event.key && event.key !== STORAGE_KEY) return
  current = readPersisted()
  for (const listener of listeners) listener()
}

// `window` is absent under SSR and in a plain node test environment; the store
// still answers from its server snapshot there.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', onStorage)
}
