/**
 * Does applying the account's gallon actually REPAINT a mounted consumer?
 *
 * Round 2 fixed the dispatch and left this open: `useResolvedGallonSync` writes
 * `UnitConverter`'s mutable statics, nothing subscribed to them, and every
 * consumption reader still takes the binary `system` and reads those statics.
 * So the next conversion was right and the pixels were not: a mounted badge
 * read `25.0 MPG` at the moment `UnitConverter.getGallonStandard()` had already
 * become `'uk'`, beside a volume column that had already moved to imperial
 * gallons. That is the exact failure `gallonStandardStore`'s docstring records,
 * reintroduced by a hook that correctly refuses to write that store.
 *
 * ★ The tree below is the PRODUCTION shape, and the shape is what makes this
 * test mean anything. `useResolvedGallonSync` runs in a PARENT (App's
 * `PreferenceSyncProvider`) and the badge is a CHILD. `children` is a prop, so
 * React bails out of re-rendering the child when the parent re-renders with the
 * same element: a parent-side state bump would NOT repaint the badge. The only
 * thing that can is the badge's own subscription, inside `useUnitPreference`.
 *
 * The badge body is copied from `VehicleStatisticsCard.tsx:267`, which is the
 * shape all four consumption consumers use: `const { system } =
 * useUnitPreference()` and then a `UnitFormatter` call.
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
import { UnitConverter, UnitFormatter } from '../../utils/units'
import { useUnitPreference } from '../useUnitPreference'
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

/** A consumption consumer, shaped like VehicleStatisticsCard.tsx:267. */
function EconomyBadge(): React.ReactElement {
  const { system } = useUnitPreference()
  // 9.4160546 L/100km is 30.0 MPG on imperial gallons, 25.0 on US ones.
  return <span data-testid="mpg">{UnitFormatter.formatFuelEconomy(9.4160546, system)}</span>
}

beforeEach(() => {
  auth.user = null
  localStorage.clear()
  seedStore('us')
})

describe('useResolvedGallonSync repaints mounted consumers', () => {
  it('★ a mounted badge shows the ACCOUNT\'s MPG, without the browser store moving', () => {
    seedStore('us')
    auth.user = makeUser({ unit_preference: 'custom', resolved_units: UK_IMPERIAL_UNITS })

    render(
      <SyncProvider>
        <EconomyBadge />
      </SyncProvider>
    )

    // The converter moved AND the pixels followed. Before the subscription in
    // `useUnitPreference`, the line below read '25.0 MPG' while the assertion
    // after it already passed.
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

  it('repaints again when the instance value is written mid-session', () => {
    // The admin's gallon toggle writes the store, which writes the same static;
    // the account's answer has to win and the badge has to say so.
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
