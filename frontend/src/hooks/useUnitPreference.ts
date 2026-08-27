/**
 * Hook to access the unit preference that applies to the current client.
 *
 * Three rungs, highest wins:
 *
 *   1. an authenticated account's own preference and `resolved_units`;
 *   2. otherwise `default_unit_prefs`, the instance-wide set `/settings/public`
 *      publishes for clients with no user (spec D5);
 *   3. otherwise the browser-owned legacy localStorage keys, which survive
 *      until phase 4 retires them.
 *
 * Rung 2 is new. Before it, an anonymous visitor and every client on an
 * `auth_mode=none` instance went straight from "no user" to
 * `localStorage.getItem('unit_preference') || 'imperial'`, so a metric-default
 * instance rendered IMPERIAL to logged-out visitors however the admin had
 * configured it. A parsed instance default outranks the legacy keys, including
 * the cached gallon standard: the server's answer is fresher than a browser
 * value that may predate the setting being changed.
 */

import { useSyncExternalStore } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { components } from '../types/api.generated';
import { binarySystemFor } from '../types/units';
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
 * becomes 'imperial' or 'metric': ~70 files branch on `system === 'imperial'`,
 * and 'custom' answers "no" to every one of them, so a UK user would have seen
 * imperial numbers rendered under metric labels.
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
 * Get the unit preference for the current client, by the three-rung precedence.
 *
 * @returns Object containing system ('imperial' | 'metric'), showBoth, gallonStandard
 *
 * @example
 * const { system, showBoth } = useUnitPreference();
 * const displayValue = UnitFormatter.formatVolume(gallons, system, showBoth);
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
    };
  }

  // `show_both_units` has no counterpart in a UnitSet, so it stays a browser
  // key for every client without an account. Rung 2 publishes units, not
  // display density.
  const storedShowBoth = localStorage.getItem('show_both_units') === 'true';

  // Rung 2: the instance default, for anonymous clients and auth_mode=none.
  if (defaultUnitPrefs) {
    return {
      system: binarySystemFor(defaultUnitPrefs.volume),
      showBoth: storedShowBoth,
      gallonStandard: gallonStandardFor(defaultUnitPrefs),
    };
  }

  // Rung 3: the browser-owned legacy keys.
  const storedSystem = localStorage.getItem('unit_preference') as UnitSystem | null;

  return {
    system: storedSystem || 'imperial',
    showBoth: storedShowBoth,
    gallonStandard: cachedGallonStandard,
  };
}
