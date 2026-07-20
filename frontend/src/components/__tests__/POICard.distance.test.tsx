import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../../__tests__/test-utils'
import POICard from '../POICard'
import type { POIResult } from '../../types/poi'

/**
 * POICard formatted every distance in miles regardless of the unit preference,
 * and then fell back to metres under one mile — so a metric user saw "1.4 mi"
 * and an imperial user saw "340 m". Both halves now follow the chosen system.
 */

let system: 'metric' | 'imperial' = 'metric'

vi.mock('../../hooks/useUnitPreference', () => ({
  useUnitPreference: () => ({ system }),
}))

const poi = {
  business_name: 'Test Shop',
  poi_category: 'auto_shop',
  distance_meters: 2300,
} as POIResult

function renderAt(meters: number, sys: 'metric' | 'imperial') {
  system = sys
  const { unmount } = render(
    <POICard poi={{ ...poi, distance_meters: meters }} onSave={() => {}} isSaved={false} />,
  )
  return unmount
}

describe('POICard distance follows the unit preference', () => {
  it('shows kilometres for a metric user', () => {
    const unmount = renderAt(2300, 'metric')
    expect(screen.getByText('2.3 km')).toBeInTheDocument()
    unmount()
  })

  it('shows miles for an imperial user', () => {
    const unmount = renderAt(2300, 'imperial')
    expect(screen.getByText('1.4 mi')).toBeInTheDocument()
    unmount()
  })

  it('shows metres, not feet, for a short metric distance', () => {
    const unmount = renderAt(340, 'metric')
    expect(screen.getByText('340 m')).toBeInTheDocument()
    unmount()
  })

  it('shows feet, not metres, for a short imperial distance', () => {
    const unmount = renderAt(340, 'imperial')
    expect(screen.getByText('1115 ft')).toBeInTheDocument()
    unmount()
  })
})
