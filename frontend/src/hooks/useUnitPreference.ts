/**
 * Hook to access the unit preference that applies to the current client.
 *
 * Four rungs, highest wins:
 *
 *   1. an authenticated account's own preference and `resolved_units`;
 *   2. an explicit anonymous choice: the browser's own `unit_prefs` store
 *      holding a resolved set (`utils/unitPrefsStore.ts`);
 *   3. `default_unit_prefs`, the instance-wide set `/settings/public` publishes
 *      for clients with no user (spec D5);
 *   4. imperial, which nothing post-093 should reach.
 *
 * Rung 3 arrived with phase 1 of this workstream. Before it, an anonymous
 * visitor and every client on an `auth_mode=none` instance went straight from
 * "no user" to `localStorage.getItem('unit_preference') || 'imperial'`, so a
 * metric-default instance rendered IMPERIAL to logged-out visitors however the
 * admin had configured it.
 *
 * ★ Rung 2 used to be the `unit_preference` localStorage key being PRESENT and
 * holding `imperial` or `metric`, expanded to a full set through a preset. That
 * gave a client with no account ONE BIT of preference where an account holds
 * eleven columns, which is the whole population that cannot use the account
 * path: anonymous visitors and every client on an `auth_mode=none` instance.
 * The store now holds a resolved set for them, migrated once off the three
 * legacy keys, so rung 2 hands its set through exactly as rung 3 does rather
 * than rebuilding it from a binary system. `system` and `gallonStandard` are
 * collapsed FROM that set on this rung too, so the card and the form below it
 * cannot disagree.
 *
 * ★ Why the instance default sits BELOW the browser's own choice rather than
 * above it. `default_unit_prefs` is a DEFAULT: what you get before you choose,
 * not something that overrides a choice already made. For an authenticated user
 * `resolved_units` IS the recorded choice, seeded from that default at account
 * creation; for a client with no account the browser store is. Ranking the
 * default above it looks harmless until you notice that on an `auth_mode=none`
 * instance `SettingsSystemTab` is where such a client sets its units,
 * `ProtectedRoute` lets `auth_mode=none` reach `/settings`, and migration 093
 * seeds `default_unit_prefs` to the imperial or UK-imperial preset and NEVER to
 * metric. A metric household upgrading would have been flipped to imperial with
 * no way back, while the toggle went on highlighting the choice it could no
 * longer honour. There is no way to tell "the user chose imperial" from "a
 * legacy key was left behind", and no need to: a leftover key is a prior choice,
 * which is why the store migrates it rather than discarding it.
 *
 * ★ `show_both_units` rides on the same store. It has no counterpart in a
 * `UnitSet`, and a browser may hold it with no units choice at all, so the
 * store's record carries a null `units` in that case and this hook still reads
 * the modifier while falling through to rung 3 for the set.
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
import {
  getUnitPrefs,
  getUnitPrefsServerSnapshot,
  subscribeToUnitPrefs,
} from '../utils/unitPrefsStore';
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
 * becomes 'imperial' or 'metric', and 'custom' answers "no" to every branch
 * that tests for one of them, so a UK user would have seen imperial numbers
 * rendered under metric labels. The files that still take such a branch used to
 * be exactly the ones `scripts/units.baseline.json` recorded; task 8 emptied
 * that file and made the gate clean-room, so the surviving population is the
 * one `bun run scripts/validate-units.ts` counts on its success line as
 * "site(s) exempt by pragma", each carrying its reason where it sits.
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
  // Subscribed for the same reason, and it is what makes the Settings card's
  // own controls repaint the screen behind them: the store parses once at
  // module load, so a component that read localStorage during render would go
  // on showing the value it read at mount.
  const storedPrefs = useSyncExternalStore(
    subscribeToUnitPrefs,
    getUnitPrefs,
    getUnitPrefsServerSnapshot,
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

  // `show_both_units` has no counterpart in a UnitSet, so it is a modifier the
  // browser store carries beside the set, and a client may hold it with no set
  // at all. Rung 3 publishes units, not display density.
  const storedShowBoth = storedPrefs?.show_both_units ?? false;

  // Rung 2: this browser's own choice, as a resolved set. `units` is null when
  // the client holds modifiers only, which is not a units choice and must not
  // outrank the instance default.
  if (storedPrefs?.units) {
    return {
      system: binarySystemFor(storedPrefs.units.volume),
      showBoth: storedShowBoth,
      gallonStandard: gallonStandardFor(storedPrefs.units),
      units: storedPrefs.units,
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
