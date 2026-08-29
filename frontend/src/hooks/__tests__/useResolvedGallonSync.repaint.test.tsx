/**
 * Which answer does a mounted consumption badge paint, and whose is it?
 *
 * ★ THIS FILE'S SUBJECT CHANGED WITH ITS SUBJECT'S SHAPE, so read the history
 * before trusting the name. Round 2 fixed the gallon DISPATCH and left a repaint
 * hole: `useResolvedGallonSync` writes `UnitConverter`'s mutable statics, every
 * consumption reader took the binary `system` and read those statics, and
 * nothing subscribed to them. So the next conversion was right and the pixels
 * were not: a mounted badge read `25.0 MPG` at the moment
 * `UnitConverter.getGallonStandard()` had already become `'uk'`, beside a volume
 * column that had already moved to imperial gallons.
 *
 * Plan 3b task 6b DISSOLVED that hole rather than guarding it. The badge below
 * is the production shape again, and the production shape is now
 * `useUnitFormat().consumption`, which closes over the account's OWN resolved
 * tokens. There is no mutable global left in the path, so there is nothing to
 * repaint late: `mpg_uk` is `mpg_uk` on the first frame.
 *
 * What is left to assert is not vacuous, and it is the question a reader of the
 * old title was really asking: WHOSE gallon does the badge paint? Rung 1 of
 * `useUnitPreference` must answer with the account's `resolved_units`, and must
 * keep answering with them when the browser-owned store moves underneath it
 * mid-session. Regressing rung 1 to `presetUnitsFor(system, cachedGallonStandard)`
 * flips the third test below from 30.0 to 25.0.
 *
 * ★ The tree is still the PRODUCTION shape: `useResolvedGallonSync` runs in a
 * PARENT (App's `PreferenceSyncProvider`) and the badge is a CHILD, reached
 * through `children`, so a parent-side state bump cannot repaint it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { makeUser, UK_IMPERIAL_UNITS, type User } from '../../__tests__/factories'

const auth = vi.hoisted(() => ({ user: null as User | null }))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: auth.user,
    isAuthenticated: auth.user !== null,
    defaultUnitPrefs: null,
  }),
}))

import { setGallonStandard as storeSet, getGallonStandard as storeGet } from '../../utils/gallonStandardStore'
import { UnitConverter } from '../../utils/units'
import { useUnitFormat } from '../useUnitFormat'
import { useResolvedGallonSync } from '../useResolvedGallonSync'

/** Flip away first: the store's setter no-ops on an unchanged value. */
function seedStore(value: 'us' | 'uk'): void {
  storeSet(value === 'us' ? 'uk' : 'us')
  storeSet(value)
}

/** App's PreferenceSyncProvider, reduced to the hook under test. */
function SyncProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  useResolvedGallonSync()
  return <>{children}</>
}

/** A consumption consumer, shaped like VehicleStatisticsCard.tsx's strip. */
function EconomyBadge(): React.ReactElement {
  const u = useUnitFormat()
  // 9.4160546 L/100km is 30.0 MPG on imperial gallons, 25.0 on US ones.
  return <span data-testid="mpg">{u.consumption.formatPrimary(9.4160546)}</span>
}

beforeEach(() => {
  auth.user = null
  localStorage.clear()
  seedStore('us')
})

describe('a mounted consumption badge paints the account\'s own gallon', () => {
  it('★ a mounted badge shows the ACCOUNT\'s MPG, without the browser store moving', () => {
    seedStore('us')
    auth.user = makeUser({ unit_preference: 'custom', resolved_units: UK_IMPERIAL_UNITS })

    render(
      <SyncProvider>
        <EconomyBadge />
      </SyncProvider>
    )

    // Rung 1's `resolved_units` decides, so the badge is right on its first
    // frame. Before task 6b this line read '25.0 MPG' until a repaint the
    // subscription in `useUnitPreference` had to arrange.
    expect(screen.getByTestId('mpg').textContent).toBe('30.0 MPG')
    expect(UnitConverter.getGallonStandard()).toBe('uk')

    // ...and the browser-owned value is untouched, which is the constraint that
    // made a plain store write the wrong mechanism.
    expect(storeGet()).toBe('us')
    expect(localStorage.getItem('imperial_gallon_standard')).toBe('us')
  })

  it('a client with no account is left on the browser value, and still renders it', () => {
    seedStore('uk')
    auth.user = null

    render(
      <SyncProvider>
        <EconomyBadge />
      </SyncProvider>
    )

    expect(screen.getByTestId('mpg').textContent).toBe('30.0 MPG')
    expect(UnitConverter.getGallonStandard()).toBe('uk')
    expect(storeGet()).toBe('uk')
  })

  it('★ holds the account\'s answer when the instance value moves mid-session', () => {
    // The admin's gallon toggle writes the store, which writes the same static;
    // the account's answer has to win and the badge has to keep saying so. This
    // is the leg that fails if rung 1 ever expands a preset from the cached
    // browser gallon instead of reading `resolved_units`.
    seedStore('uk')
    auth.user = makeUser({ unit_preference: 'custom', resolved_units: UK_IMPERIAL_UNITS })

    render(
      <SyncProvider>
        <EconomyBadge />
      </SyncProvider>
    )
    expect(screen.getByTestId('mpg').textContent).toBe('30.0 MPG')

    // `act` so the store's notification, the resulting render and the effect
    // that re-asserts all flush before the assertions; without it this asserts
    // against a frame React has not produced yet.
    act(() => {
      storeSet('us')
    })

    expect(storeGet()).toBe('us')
    expect(UnitConverter.getGallonStandard()).toBe('uk')
    expect(screen.getByTestId('mpg').textContent).toBe('30.0 MPG')
  })
})
