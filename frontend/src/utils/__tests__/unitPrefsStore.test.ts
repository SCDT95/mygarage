/**
 * The browser's own unit preferences, and the one-shot migration off the three
 * legacy keys.
 *
 * The store parses ONCE at module load and holds the object, because
 * `useSyncExternalStore` calls `getSnapshot` on every render and throws if it
 * is handed a fresh object each time. That makes module load the arrange step:
 * every test seeds `localStorage` and THEN calls `loadStore()`, which resets the
 * module registry and re-imports. Setting a key after the import and expecting
 * the store to see it is the trap this shape creates, and it is why the two
 * event tests below exist: an event is the only way a later write reaches a
 * store that has already parsed.
 *
 * ★ Several cases here assert that something is null or absent, which a store
 * that does nothing at all satisfies. Every one of them therefore asserts BOTH
 * directions: the arrangement that MUST produce a record first, then the
 * neighbouring arrangement that must not. The direction that is false against
 * an empty store is the one carrying the proof.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  IMPERIAL_UNITS,
  METRIC_UNITS,
  UK_IMPERIAL_UNITS,
  makeUnitSet,
} from '@/__tests__/factories'

type StoreModule = typeof import('../unitPrefsStore')

/** The key the store owns. */
const UNIT_PREFS_KEY = 'unit_prefs'

/** The three keys it migrates off, exactly as the shipped code spells them. */
const LEGACY_SYSTEM_KEY = 'unit_preference'
const LEGACY_GALLON_KEY = 'imperial_gallon_standard'
const LEGACY_SHOW_BOTH_KEY = 'show_both_units'

/**
 * Load a fresh copy of the store against whatever `localStorage` now holds.
 *
 * @returns The module, re-evaluated, so its module-load parse sees this test's
 *   arrangement rather than the previous test's.
 */
async function loadStore(): Promise<StoreModule> {
  vi.resetModules()
  return await import('../unitPrefsStore')
}

describe('unitPrefsStore migration off the legacy keys', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('migrates a legacy metric choice into a full stored set', async () => {
    localStorage.setItem(LEGACY_SYSTEM_KEY, 'metric')

    const { getUnitPrefs } = await loadStore()

    const prefs = getUnitPrefs()
    expect(prefs).not.toBeNull()
    expect(prefs!.units).toEqual(METRIC_UNITS)
    expect(prefs!.unit_preference).toBe('metric')
  })

  it('migrates a legacy imperial choice on a UK-gallon browser as custom', async () => {
    // ★ The imperial preset is US gallons (`app/constants/units.py`), so this
    // browser's resolved set is NOT the preset its key names. Migration 093
    // retags exactly this population `custom`; a store that copies the key
    // through would leave the card highlighting Imperial and hiding the Custom
    // controls while the client renders gal_uk.
    localStorage.setItem(LEGACY_SYSTEM_KEY, 'imperial')
    localStorage.setItem(LEGACY_GALLON_KEY, 'uk')

    const { getUnitPrefs } = await loadStore()

    const prefs = getUnitPrefs()
    expect(prefs).not.toBeNull()
    expect(prefs!.units).toEqual(UK_IMPERIAL_UNITS)
    expect(prefs!.unit_preference).toBe('custom')
  })

  it('migrates a legacy metric choice on a UK-gallon browser as custom too', async () => {
    // The same rule, on the population migration 093 never had to consider: a
    // metric account's columns are NULL server-side, so it resolves to the
    // metric preset with secondary_gallon 'us'. A metric BROWSER on a UK
    // instance really does hold a set the metric preset does not contain, and
    // the tag has to say so or the card lies in the other direction.
    localStorage.setItem(LEGACY_SYSTEM_KEY, 'metric')
    localStorage.setItem(LEGACY_GALLON_KEY, 'uk')

    const { getUnitPrefs } = await loadStore()

    const prefs = getUnitPrefs()
    expect(prefs).not.toBeNull()
    expect(prefs!.units).toEqual({ ...METRIC_UNITS, secondary_gallon: 'uk' })
    expect(prefs!.unit_preference).toBe('custom')
  })

  it('carries a legacy show-both choice across', async () => {
    localStorage.setItem(LEGACY_SYSTEM_KEY, 'metric')
    localStorage.setItem(LEGACY_SHOW_BOTH_KEY, 'true')

    const { getUnitPrefs } = await loadStore()

    const prefs = getUnitPrefs()
    expect(prefs).not.toBeNull()
    expect(prefs!.show_both_units).toBe(true)
  })

  it('runs the migration once, so a legacy key written again cannot overwrite a later choice', async () => {
    // ★ `useGallonStandardSync` writes `imperial_gallon_standard` from the
    // server on every boot, for every client, so a migration guarded on a
    // legacy key being PRESENT re-runs forever. The guard is on the new key
    // being ABSENT.
    localStorage.setItem(LEGACY_SYSTEM_KEY, 'metric')
    const first = await loadStore()
    const migrated = first.getUnitPrefs()
    expect(migrated).not.toBeNull()
    expect(migrated!.units).toEqual(METRIC_UNITS)

    first.setUnitPrefs({
      units: IMPERIAL_UNITS,
      unit_preference: 'imperial',
      show_both_units: false,
    })

    // The next boot, with both legacy keys still sitting there saying metric.
    localStorage.setItem(LEGACY_SYSTEM_KEY, 'metric')
    localStorage.setItem(LEGACY_GALLON_KEY, 'us')
    const second = await loadStore()

    const prefs = second.getUnitPrefs()
    expect(prefs).not.toBeNull()
    expect(prefs!.units).toEqual(IMPERIAL_UNITS)
    expect(prefs!.unit_preference).toBe('imperial')
  })

  it('does not freeze a gallon flavour the browser never chose', async () => {
    // ★ THE MIGRATION MUST NOT PERSIST. It reads `imperial_gallon_standard` at
    // MODULE LOAD, before `useGallonStandardSync`'s /settings/public fetch has
    // resolved, and an absent key falls back to `us`. Persisting that guess
    // freezes it: every later path is guarded on `unit_prefs` being ABSENT, so
    // nothing can heal the record afterwards.
    //
    // Reachable on a UK instance whose first post-upgrade settings fetch fails,
    // and on any instance whose admin later switches the published flavour.
    // Either leaves every volume and MPG about twenty percent wrong, forever.
    localStorage.setItem(LEGACY_SYSTEM_KEY, 'imperial')

    const firstBoot = await loadStore()
    expect(firstBoot.getUnitPrefs()!.units).toEqual(IMPERIAL_UNITS)
    // The guess must not have been written down.
    expect(localStorage.getItem(UNIT_PREFS_KEY)).toBeNull()

    // The server answers UK on the next boot, the way the sync hook would.
    localStorage.setItem(LEGACY_GALLON_KEY, 'uk')
    const secondBoot = await loadStore()

    const prefs = secondBoot.getUnitPrefs()
    expect(prefs).not.toBeNull()
    expect(prefs!.units!.volume).toBe('gal_uk')
    expect(prefs!.unit_preference).toBe('custom')
  })

  it('holds a record when the browser chose, and nothing when it never did', async () => {
    localStorage.setItem(LEGACY_SYSTEM_KEY, 'imperial')
    const chose = await loadStore()
    expect(chose.getUnitPrefs()).not.toBeNull()

    localStorage.clear()
    const neverChose = await loadStore()
    expect(neverChose.getUnitPrefs()).toBeNull()
  })

  it('does not invent a units rung from the gallon key alone', async () => {
    // ★ `useGallonStandardSync` writes this key for EVERY client, chosen or
    // not, so materialising a set from it would pin every such browser to
    // whatever it happened to say and outrank the instance default. Only
    // `unit_preference` records an actual choice.
    localStorage.setItem(LEGACY_GALLON_KEY, 'uk')
    localStorage.setItem(LEGACY_SYSTEM_KEY, 'imperial')
    const chose = await loadStore()
    const withChoice = chose.getUnitPrefs()
    expect(withChoice).not.toBeNull()
    expect(withChoice!.units).toEqual(UK_IMPERIAL_UNITS)

    localStorage.clear()
    localStorage.setItem(LEGACY_GALLON_KEY, 'uk')
    const gallonOnly = await loadStore()
    expect(gallonOnly.getUnitPrefs()?.units ?? null).toBeNull()
  })

  it('keeps a show-both-only browser modifier without activating a units rung', async () => {
    // ★ `show_both_units` is separately settable today by a client with no
    // account, so a browser holding only that key HAS made a choice. Dropping
    // it because there is no units rung to hang it on is the loss the legacy
    // migration exists to prevent.
    localStorage.setItem(LEGACY_SHOW_BOTH_KEY, 'true')

    const { getUnitPrefs } = await loadStore()

    const prefs = getUnitPrefs()
    expect(prefs).not.toBeNull()
    expect(prefs!.show_both_units).toBe(true)
    expect(prefs!.units).toBeNull()
    expect(prefs!.unit_preference).toBeNull()
  })
})

describe('unitPrefsStore reading its own key', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('discards an unparseable record but keeps a parseable one', async () => {
    localStorage.setItem(UNIT_PREFS_KEY, JSON.stringify({ units: METRIC_UNITS, show_both_units: false }))
    const good = await loadStore()
    const parsed = good.getUnitPrefs()
    expect(parsed).not.toBeNull()
    expect(parsed!.units).toEqual(METRIC_UNITS)

    localStorage.setItem(UNIT_PREFS_KEY, '{not json at all')
    const bad = await loadStore()
    expect(bad.getUnitPrefs()).toBeNull()
  })

  it('discards a set WHOLE when one unit is out of vocabulary', async () => {
    // Mirrors `parse_default_unit_prefs` on the backend: half a set puts the
    // client on a silently different unit from the server, so one bad token
    // discards all eleven rather than being patched from a preset.
    localStorage.setItem(
      UNIT_PREFS_KEY,
      JSON.stringify({ units: makeUnitSet({ pressure: 'bar' }), show_both_units: false })
    )
    const good = await loadStore()
    const parsed = good.getUnitPrefs()
    expect(parsed).not.toBeNull()
    expect(parsed!.units!.pressure).toBe('bar')

    localStorage.setItem(
      UNIT_PREFS_KEY,
      JSON.stringify({ units: { ...METRIC_UNITS, pressure: 'furlongs' }, show_both_units: false })
    )
    const bad = await loadStore()
    expect(bad.getUnitPrefs()).toBeNull()
  })

  it('hands out a referentially stable snapshot, and no snapshot at all to the server', async () => {
    // `useSyncExternalStore` calls `getSnapshot` on every render and throws
    // "The result of getSnapshot should be cached" if it returns a fresh object
    // each time, which is exactly what parsing JSON per read would do.
    localStorage.setItem(LEGACY_SYSTEM_KEY, 'metric')

    const { getUnitPrefs, getUnitPrefsServerSnapshot } = await loadStore()

    const first = getUnitPrefs()
    expect(first).not.toBeNull()
    expect(getUnitPrefs()).toBe(first)
    expect(getUnitPrefsServerSnapshot()).toBeNull()
  })
})

describe('unitPrefsStore subscriptions', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('notifies a subscriber on a write, and stops once it unsubscribes', async () => {
    const { subscribeToUnitPrefs, setUnitPrefs } = await loadStore()
    const listener = vi.fn()
    const unsubscribe = subscribeToUnitPrefs(listener)

    setUnitPrefs({ units: METRIC_UNITS, unit_preference: 'metric', show_both_units: false })
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    setUnitPrefs({ units: IMPERIAL_UNITS, unit_preference: 'imperial', show_both_units: false })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('publishes a write to later readers', async () => {
    const { getUnitPrefs, setUnitPrefs } = await loadStore()

    setUnitPrefs({ units: IMPERIAL_UNITS, unit_preference: 'imperial', show_both_units: true })

    const prefs = getUnitPrefs()
    expect(prefs).not.toBeNull()
    expect(prefs!.units).toEqual(IMPERIAL_UNITS)
    expect(prefs!.show_both_units).toBe(true)
  })

  it('lands a real cross-tab StorageEvent', async () => {
    const { getUnitPrefs, subscribeToUnitPrefs } = await loadStore()
    const listener = vi.fn()
    subscribeToUnitPrefs(listener)
    expect(getUnitPrefs()).toBeNull()

    const written = JSON.stringify({ units: IMPERIAL_UNITS, show_both_units: false })
    localStorage.setItem(UNIT_PREFS_KEY, written)
    window.dispatchEvent(
      new StorageEvent('storage', { key: UNIT_PREFS_KEY, newValue: written })
    )

    expect(listener).toHaveBeenCalled()
    const landed = getUnitPrefs()
    expect(landed).not.toBeNull()
    expect(landed!.units).toEqual(IMPERIAL_UNITS)
  })

  it('invalidates on a KEYLESS synthetic storage Event', async () => {
    // ★ Not hypothetical: `SettingsSystemTab` fires
    // `window.dispatchEvent(new Event('storage'))` in its time-format handler, a
    // synthetic Event with no `key` at all. A handler written
    // `if (event.key !== 'unit_prefs') return` discards every one of them, and
    // so would a real StorageEvent with `key === null`, which is how a
    // whole-store clear arrives.
    const { getUnitPrefs, subscribeToUnitPrefs } = await loadStore()
    const listener = vi.fn()
    subscribeToUnitPrefs(listener)
    expect(getUnitPrefs()).toBeNull()

    localStorage.setItem(
      UNIT_PREFS_KEY,
      JSON.stringify({ units: METRIC_UNITS, show_both_units: true })
    )
    window.dispatchEvent(new Event('storage'))

    expect(listener).toHaveBeenCalled()
    const landed = getUnitPrefs()
    expect(landed).not.toBeNull()
    expect(landed!.show_both_units).toBe(true)
  })
})
