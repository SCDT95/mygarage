/**
 * Hook to access the unit preference that applies to the current client.
 *
 * Four rungs, highest wins:
 *
 *   1. an authenticated account's own preference and `resolved_units`;
 *   2. an explicit anonymous choice: the `unit_preference` localStorage key
 *      being PRESENT and holding a value the app recognises;
 *   3. `default_unit_prefs`, the instance-wide set `/settings/public` publishes
 *      for clients with no user (spec D5);
 *   4. imperial, which nothing post-093 should reach.
 *
 * Rung 3 is new. Before it, an anonymous visitor and every client on an
 * `auth_mode=none` instance went straight from "no user" to
 * `localStorage.getItem('unit_preference') || 'imperial'`, so a metric-default
 * instance rendered IMPERIAL to logged-out visitors however the admin had
 * configured it.
 *
 * ★ Why the instance default sits BELOW the browser key rather than above it.
 * `default_unit_prefs` is a DEFAULT: what you get before you choose, not
 * something that overrides a choice already made. For an authenticated user
 * `resolved_units` IS the recorded choice, seeded from that default at account
 * creation; for an anonymous client the localStorage key is. Ranking the
 * default above the key looks harmless until you notice that on an
 * `auth_mode=none` instance `SettingsSystemTab` writes that key for a client
 * with no account, `ProtectedRoute` lets `auth_mode=none` reach `/settings`, and
 * migration 093 seeds `default_unit_prefs` to the imperial or UK-imperial preset
 * and NEVER to metric. A metric household upgrading would have been flipped to
 * imperial with no way back, while the toggle went on highlighting the choice it
 * could no longer honour. There is no way to tell "the user chose imperial" from
 * "a legacy key was left behind", and no need to: a leftover key is a prior
 * choice.
 */

import { useSyncExternalStore } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { components } from '../types/api.generated';
import { binarySystemFor, presetUnitsFor, type UnitSet } from '../types/units';
import { type GallonStandard, type UnitSystem } from '../utils/units';
import {
  getGallonStandard,
  getGallonStandardServerSnapshot,
  subscribeToGallonStandard,
} from '../utils/gallonStandardStore';
import { gallonStandardFor } from '../utils/publicUnitDefaults';

interface UnitPreference {
  system: UnitSystem;
  showBoth: boolean;
  gallonStandard: GallonStandard;
  /**
   * The fully resolved per-quantity set, which `useUnitFormat()` closes over.
   *
   * Derived on the SAME rung as `system` and `gallonStandard`, never
   * independently: those two are what a resolved set collapses to
   * (`binarySystemFor(units.volume)` and `gallonStandardFor(units)`), and a
   * screen where the card and the form below it disagree about a unit is worse
   * than one that is uniformly wrong. Rungs 1 and 3 have a real set; rungs 2
   * and 4 hold only a binary system and a gallon flavour, so they expand it
   * through `presetUnitsFor` rather than inventing one at the call site.
   */
  units: UnitSet;
}

/** The parts of an account that decide the binary system. */
type UnitPreferenceFields = Pick<
  components['schemas']['UserResponse'],
  'unit_preference' | 'resolved_units'
>;

/**
 * Collapse a stored unit preference to the binary system every caller expects.
 *
 * Migration 093 materialises per-quantity users as `unit_preference='custom'`,
 * a value `UnitSystem` does not contain. This is the single chokepoint where it
 * becomes 'imperial' or 'metric': the files that still branch on
 * `system === 'imperial'` are exactly the ones `scripts/units.baseline.json`
 * records, and 'custom' answers "no" to every one of them, so a UK user would
 * have seen imperial numbers rendered under metric labels.
 *
 * ★ This line used to say "~70 files", a number wrong by 4.6x read as files and
 * named in the phase 3 plan as its twelfth floor. The deferral's own stated
 * precondition was "fix it in 3b when the number it describes actually
 * changes"; it changed in phase 3a, so it is fixed here, and fixed by pointing
 * at the artifact that measures it rather than by writing a fresher number that
 * would go stale the same way. `bun run validate:units -- --report` prints the
 * current list grouped by file.
 *
 * @param user The authenticated account's preference fields.
 * @returns The binary unit system to render with.
 */
function systemFor(user: UnitPreferenceFields): UnitSystem {
  if (user.unit_preference === 'custom') {
    // Falling through to the imperial default would put a UK user on US
    // gallons, the exact bug this change exists to fix. The schema makes
    // `resolved_units` required, but a browser holding a cached bundle against
    // an older backend can still be handed a response without it.
    return user.resolved_units ? binarySystemFor(user.resolved_units.volume) : 'imperial';
  }
  return user.unit_preference ?? 'imperial';
}

/**
 * Get the unit preference for the current client, by the four-rung precedence
 * this file's header describes.
 *
 * @returns The binary system, the show-both flag, the gallon standard, and the
 *   fully resolved per-quantity set, all decided on the same rung.
 *
 * @example
 * const { units, showBoth } = useUnitPreference();
 * const displayValue = UnitFormatter.formatVolume(liters, units, showBoth);
 *
 * Prefer `useUnitFormat()` in a component: it closes over `units` and answers
 * per quantity, where `system` can only answer for the whole client.
 */
export function useUnitPreference(): UnitPreference {
  const { user, isAuthenticated, defaultUnitPrefs } = useAuth();
  // Subscribed, not read-and-mutated during render: changing the standard has
  // to re-render everything that displays a volume, and a hook body must not
  // write global state (StrictMode runs it twice).
  const cachedGallonStandard = useSyncExternalStore(
    subscribeToGallonStandard,
    getGallonStandard,
    getGallonStandardServerSnapshot,
  );
  // ★ A SECOND SUBSCRIPTION USED TO SIT HERE AND IS GONE. It watched
  // `UnitConverter`'s mutable gallon statics so a mounted component repainted
  // when they moved, because every consumption and fuel-rate reader took the
  // binary `system` and read them. Plan 3b task 6b moved all thirty-one onto the
  // resolved set, which left the sync writing a value nothing read and this hook
  // subscribing to a change nothing could observe: a closed loop, and the loop
  // was defect L1's own mechanism. Task 8 deleted it whole, with
  // `hooks/useResolvedGallonSync.ts` and the three exports in `utils/units.ts`
  // that served it. `gallonStandard` below is resolved per rung and was never
  // read from the converter, so nothing here changes.

  // Rung 1: the account's own preference.
  if (isAuthenticated && user) {
    return {
      system: systemFor(user),
      showBoth: user.show_both_units || false,
      // `resolved_units` is required by the schema, but a browser holding a
      // cached bundle against an older backend can still be handed a response
      // without it; that client keeps the instance-wide cached value.
      gallonStandard: user.resolved_units
        ? gallonStandardFor(user.resolved_units)
        : cachedGallonStandard,
      units: user.resolved_units ?? presetUnitsFor(systemFor(user), cachedGallonStandard),
    };
  }

  // `show_both_units` has no counterpart in a UnitSet, so it stays a browser
  // key for every client without an account. Rung 3 publishes units, not
  // display density.
  const storedShowBoth = localStorage.getItem('show_both_units') === 'true';

  // Rung 2: an explicit anonymous choice. The same browser that authored this
  // key authored the cached gallon standard, through the same Settings panel,
  // so both browser-held values apply together.
  const storedSystem = readStoredUnitSystem();
  if (storedSystem !== null) {
    return {
      system: storedSystem,
      showBoth: storedShowBoth,
      gallonStandard: cachedGallonStandard,
      units: presetUnitsFor(storedSystem, cachedGallonStandard),
    };
  }

  // Rung 3: the instance default, for a browser that has never chosen.
  if (defaultUnitPrefs) {
    return {
      system: binarySystemFor(defaultUnitPrefs.volume),
      showBoth: storedShowBoth,
      gallonStandard: gallonStandardFor(defaultUnitPrefs),
      units: defaultUnitPrefs,
    };
  }

  // Rung 4. Post-093 every instance publishes a default, so reaching this means
  // the settings fetch failed or the row is unparseable.
  return {
    system: 'imperial',
    showBoth: storedShowBoth,
    gallonStandard: cachedGallonStandard,
    units: presetUnitsFor('imperial', cachedGallonStandard),
  };
}

/**
 * Read the browser's own unit choice, if it holds one the app recognises.
 *
 * `localStorage.getItem('unit_preference') as UnitSystem` used to hand any
 * stored text straight back as a `UnitSystem`, a value the type says cannot
 * exist. A key the app cannot read is noise rather than a recorded choice, so
 * it returns null and the caller falls through to the instance default.
 *
 * The `units-exempt` marker below is deliberate and is not deferred work: there
 * is no quantity here and nothing to convert, so `validate-units.ts` flags it
 * only because it is fail-closed on an operand whose provenance it cannot see.
 * The marker has to sit on the line directly above the comparison, which is why
 * the reasoning lives up here and the one-line reason lives down there.
 *
 * @returns The stored system, or null when the browser holds no usable choice.
 */
function readStoredUnitSystem(): UnitSystem | null {
  const stored = localStorage.getItem('unit_preference');
  // units-exempt(compare): validating parse of a stored string, not a display conversion.
  return stored === 'imperial' || stored === 'metric' ? stored : null;
}
