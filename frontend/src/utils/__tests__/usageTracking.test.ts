import { describe, it, expect } from 'vitest'
import { getUsageTracking } from '../usageTracking'

describe('getUsageTracking', () => {
  it('treats a distance-only vehicle as distance-primary, hours untracked', () => {
    expect(getUsageTracking({ usage_unit: 'distance', secondary_usage_enabled: false })).toEqual({
      tracksDistance: true,
      tracksHours: false,
      primary: 'distance',
    })
  })

  it('treats an hours-only vehicle as hours-primary, distance untracked', () => {
    expect(getUsageTracking({ usage_unit: 'hours', secondary_usage_enabled: false })).toEqual({
      tracksDistance: false,
      tracksHours: true,
      primary: 'hours',
    })
  })

  it('tracks both when distance-primary has the secondary dimension enabled', () => {
    expect(getUsageTracking({ usage_unit: 'distance', secondary_usage_enabled: true })).toEqual({
      tracksDistance: true,
      tracksHours: true,
      primary: 'distance',
    })
  })

  it('tracks both when hours-primary has the secondary dimension enabled', () => {
    expect(getUsageTracking({ usage_unit: 'hours', secondary_usage_enabled: true })).toEqual({
      tracksDistance: true,
      tracksHours: true,
      primary: 'hours',
    })
  })

  it('treats an undefined usage_unit as distance', () => {
    expect(getUsageTracking({ usage_unit: undefined, secondary_usage_enabled: false })).toEqual({
      tracksDistance: true,
      tracksHours: false,
      primary: 'distance',
    })
  })

  it('treats a missing secondary_usage_enabled as false', () => {
    expect(getUsageTracking({ usage_unit: 'distance' })).toEqual({
      tracksDistance: true,
      tracksHours: false,
      primary: 'distance',
    })
    expect(getUsageTracking({ usage_unit: 'hours' })).toEqual({
      tracksDistance: false,
      tracksHours: true,
      primary: 'hours',
    })
  })
})
