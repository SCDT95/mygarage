/**
 * Apply the CLIENT's own gallon flavour to `UnitConverter`'s mutable statics.
 *
 * ★ This is defect L1's consumption half, fixed at the DISPATCH rather than at
 * the call sites. `UnitConverter` keeps the gallon and MPG factors in mutable
 * statics (`units.ts`), and `useGallonStandardSync` drives them from the
 * INSTANCE setting. Every consumption and fuel-rate helper reads those statics
 * instead of taking a resolved `UnitSet`, so a user whose `resolved_units`
 * name `gal_uk` on a US-default instance read their volume and price in
 * imperial gallons and their MPG on US ones. Two gallons on one screen, and the
 * MPG is a WRONG number, not merely an inconsistent one: 30.0 MPG shown as
 * 25.0 beside a volume column that says 10.00 gal.
 *
 * Fixing that by widening thirty-one call sites to take a `UnitSet` is 3b's
 * shape, not this one's. `useUnitPreference().gallonStandard` already resolves
 * the flavour on the same four-rung precedence as everything else, with an
 * account's `resolved_units` on rung 1, and until now it had no consumer at
 * all. Pushing it into the statics makes every reader correct without touching
 * one of them.
 *
 * ★ It writes `UnitConverter`, never the store. `gallonStandardStore` persists
 * to localStorage and is BROWSER-owned: it holds an anonymous client's own
 * choice, or the instance value `useGallonStandardSync` reconciles from
 * `/settings/public`. Writing a per-account answer into it would overwrite a
 * key no account owns, which is the shape of the N1 finding in phase 3a's
 * ledger. The converter's static is per-process, and one process is one
 * browser tab is one signed-in client; a different account arriving without a
 * reload changes `gallonStandard` and re-runs the effect.
 *
 * Call ONCE, inside `AuthProvider` and after `useGallonStandardSync`, which
 * `App`'s `PreferenceSyncProvider` does.
 */

import { useEffect, useSyncExternalStore } from 'react'
import {
  getGallonStandard,
  getGallonStandardServerSnapshot,
  subscribeToGallonStandard,
} from '../utils/gallonStandardStore'
import { UnitConverter } from '../utils/units'
import { useUnitPreference } from './useUnitPreference'

/**
 * Keep `UnitConverter`'s gallon and MPG factors on the client's own flavour.
 *
 * @returns Nothing; the effect is the whole point.
 */
export function useResolvedGallonSync(): void {
  const { gallonStandard } = useUnitPreference()
  // Subscribed so this effect re-runs whenever the browser-owned store is
  // written. Two writers do that after mount and both carry the INSTANCE
  // answer: `useGallonStandardSync`'s reconcile, and the admin's gallon toggle
  // in Settings. Without the re-assert the converter would keep the instance
  // flavour for the rest of the session.
  const cached = useSyncExternalStore(
    subscribeToGallonStandard,
    getGallonStandard,
    getGallonStandardServerSnapshot,
  )

  useEffect(() => {
    // When the store already holds this client's answer, its own write applied
    // it: the store writes the converter on every change, so the two cannot
    // disagree in that case.
    if (cached === gallonStandard) return
    UnitConverter.setGallonStandard(gallonStandard)
  }, [cached, gallonStandard])
}
