import { useQuery } from '@tanstack/react-query'
import api from '@/services/api'

interface HoursListResponse {
  latest_engine_hours: number | string | null
}

/**
 * Fetch the latest engine-hours reading for a vehicle. Mirrors
 * useLatestMileage exactly (same query-key/staleTime conventions, same
 * "list endpoint carries a canonical `latest_*` field" shape) so the two
 * usage dimensions stay symmetrical for interval-based reminder math.
 * Engine hours are dimensionless — no unit conversion, unlike odometer km.
 * Returns the canonical hours value (Decimal serialised as string is coerced
 * to number) or null if no records exist.
 */
export function useLatestHours(vin: string) {
  return useQuery({
    queryKey: ['latestHours', vin],
    queryFn: async () => {
      const { data } = await api.get<HoursListResponse>(
        `/vehicles/${vin}/hours`,
        { params: { limit: 1 } },
      )
      const raw = data.latest_engine_hours
      if (raw == null) return null
      const num = typeof raw === 'string' ? parseFloat(raw) : raw
      return isNaN(num) ? null : num
    },
    enabled: !!vin,
    staleTime: 60_000,
  })
}
