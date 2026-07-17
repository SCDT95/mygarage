/**
 * LiveLink Trips Tab - GPS-tracked drive session list
 *
 * List only (Task 14). Task 15 renders the route map into the placeholder
 * slot below when a trip is selected; Task 16 adds a last-location card.
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Clock, MapPin, Calendar, RefreshCw, Route, Map as MapIcon } from 'lucide-react'
import { livelinkService } from '@/services/livelinkService'
import vehicleService from '@/services/vehicleService'
import type { Trip, TripList } from '@/types/trips'
import { useUnitPreference } from '@/hooks/useUnitPreference'
import { useTimeFormat } from '@/hooks/useTimeFormat'
import { formatAPITimestamp, formatTime } from '@/utils/parseAPITimestamp'
import { UnitFormatter } from '@/utils/units'

interface LiveLinkTripsTabProps {
  vin: string
}

export default function LiveLinkTripsTab({ vin }: LiveLinkTripsTabProps) {
  const { t } = useTranslation('vehicles')
  const [trips, setTrips] = useState<TripList | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null)
  const [locationTrackingEnabled, setLocationTrackingEnabled] = useState<boolean | null>(null)
  const [trackingSaving, setTrackingSaving] = useState(false)
  const { system: unitSystem, showBoth } = useUnitPreference()

  const fetchTrips = useCallback(async () => {
    setLoading(true)
    try {
      const data = await livelinkService.getTrips(vin, { limit: 50 })
      setTrips(data)
    } catch (err) {
      console.error('Failed to fetch trips:', err)
      toast.error(t('livelink.trips.loadError'))
    } finally {
      setLoading(false)
    }
  }, [vin, t])

  const fetchLocationTrackingState = useCallback(async () => {
    try {
      const vehicle = await vehicleService.get(vin)
      setLocationTrackingEnabled(vehicle.location_tracking_enabled)
    } catch (err) {
      console.error('Failed to fetch location-tracking state:', err)
    }
  }, [vin])

  useEffect(() => {
    fetchTrips()
    fetchLocationTrackingState()
  }, [fetchTrips, fetchLocationTrackingState])

  const handleToggleLocationTracking = async (): Promise<void> => {
    if (locationTrackingEnabled === null || trackingSaving) return
    const next = !locationTrackingEnabled
    setTrackingSaving(true)
    try {
      const result = await livelinkService.setLocationTracking(vin, next)
      setLocationTrackingEnabled(result.location_tracking_enabled)
      toast.success(
        result.location_tracking_enabled
          ? t('livelink.trips.locationTrackingEnabled')
          : t('livelink.trips.locationTrackingDisabled'),
      )
    } catch (err) {
      console.error('Failed to update location tracking:', err)
      toast.error(t('livelink.trips.locationTrackingError'))
    } finally {
      setTrackingSaving(false)
    }
  }

  const formatDuration = (seconds: number | null | undefined): string => {
    if (seconds == null) return '--'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  const formatDistance = (km: number | null | undefined): string => {
    if (km == null) return '--'
    return UnitFormatter.formatDistance(km, unitSystem, showBoth)
  }

  const toggleSelected = (sessionId: number): void => {
    setSelectedTripId(selectedTripId === sessionId ? null : sessionId)
  }

  const locationTrackingToggle = (
    <button
      type="button"
      role="switch"
      aria-checked={locationTrackingEnabled ?? false}
      disabled={locationTrackingEnabled === null || trackingSaving}
      onClick={handleToggleLocationTracking}
      title={t('livelink.trips.locationTracking')}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        locationTrackingEnabled ? 'bg-primary' : 'bg-garage-border'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          locationTrackingEnabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )

  const header = (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-garage-text-muted">
        {trips ? t('livelink.trips.tripCount', { count: trips.trips?.length ?? 0 }) : ''}
      </span>
      <div className="flex items-center gap-3">
        <span className="text-sm text-garage-text">{t('livelink.trips.locationTracking')}</span>
        {locationTrackingToggle}
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="space-y-4">
        {header}
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        </div>
      </div>
    )
  }

  const tripList = trips?.trips ?? []

  if (tripList.length === 0) {
    return (
      <div className="space-y-4">
        {header}
        <div className="bg-garage-surface rounded-lg border border-garage-border p-8 text-center">
          <Route className="w-12 h-12 mx-auto mb-3 text-garage-text-muted opacity-50" />
          <p className="text-garage-text">{t('livelink.trips.noRecords')}</p>
          <p className="text-sm text-garage-text-muted mt-2">{t('livelink.trips.autoDetected')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {header}

      {/* Trip List */}
      <div className="space-y-3">
        {tripList.map((trip) => (
          <TripCard
            key={trip.session_id}
            trip={trip}
            isSelected={selectedTripId === trip.session_id}
            onSelect={() => toggleSelected(trip.session_id)}
            formatDuration={formatDuration}
            formatDistance={formatDistance}
          />
        ))}
      </div>

      {/* Route map placeholder — Task 15 renders the selected trip's GPS polyline here */}
      {selectedTripId != null && (
        <div className="bg-garage-surface rounded-lg border border-garage-border p-8 text-center">
          <MapIcon className="w-12 h-12 mx-auto mb-3 text-garage-text-muted opacity-50" />
          <p className="text-garage-text-muted">{t('livelink.trips.mapComingSoon')}</p>
        </div>
      )}
    </div>
  )
}

// Trip Card Component
function TripCard({
  trip,
  isSelected,
  onSelect,
  formatDuration,
  formatDistance,
}: {
  trip: Trip
  isSelected: boolean
  onSelect: () => void
  formatDuration: (s: number | null | undefined) => string
  formatDistance: (km: number | null | undefined) => string
}) {
  const { t } = useTranslation('vehicles')
  const { timeFormat } = useTimeFormat()

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left bg-garage-surface rounded-lg border p-4 transition-colors hover:bg-garage-bg/50 ${
        isSelected ? 'border-primary' : 'border-garage-border'
      }`}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <div>
            <div className="text-garage-text font-medium">
              {formatAPITimestamp(trip.started_at, (d) =>
                d.toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                }),
              )}
            </div>
            <div className="text-xs text-garage-text-muted">
              {formatTime(trip.started_at, timeFormat)}
              {trip.ended_at && (
                <>
                  {' → '}
                  {formatTime(trip.ended_at, timeFormat)}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm text-garage-text-muted">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>{formatDuration(trip.duration_seconds)}</span>
          </div>
          <div className="flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            <span>{formatDistance(trip.distance_km)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Route className="w-4 h-4" />
            <span>{t('livelink.trips.pointCount', { count: trip.point_count })}</span>
          </div>
        </div>
      </div>
    </button>
  )
}
