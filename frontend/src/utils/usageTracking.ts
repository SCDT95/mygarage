/**
 * Usage-dimension resolution for vehicles that track distance, engine
 * hours, or both.
 *
 * Pure utility — no React. Structural param type so any object carrying
 * `usage_unit` + `secondary_usage_enabled` (vehicle, VehicleStatistics,
 * detail-stats, ...) can be passed without importing a specific generated
 * type.
 */

interface UsageTrackingSource {
  usage_unit?: 'distance' | 'hours' | string | null
  secondary_usage_enabled?: boolean | null
}

export interface UsageTracking {
  tracksDistance: boolean
  tracksHours: boolean
  primary: 'distance' | 'hours'
}

/**
 * Resolve which usage dimension(s) a vehicle tracks.
 *
 * `usage_unit` selects the primary dimension (defaults to `'distance'` when
 * missing/undefined); `secondary_usage_enabled` (defaults to `false`) adds
 * the other dimension without changing which one is primary.
 */
export function getUsageTracking(v: UsageTrackingSource): UsageTracking {
  const primary: 'distance' | 'hours' = v.usage_unit === 'hours' ? 'hours' : 'distance'
  const secondaryEnabled = !!v.secondary_usage_enabled
  return {
    tracksDistance: primary === 'distance' || secondaryEnabled,
    tracksHours: primary === 'hours' || secondaryEnabled,
    primary,
  }
}
