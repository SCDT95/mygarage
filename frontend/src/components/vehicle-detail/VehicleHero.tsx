import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowLeft, Car, AlertTriangle } from 'lucide-react'
import type { Vehicle } from '../../types/vehicle'

interface VehicleHeroProps {
  vehicle: Vehicle
  photoUrl: string | null
  fromCache: boolean
}

/**
 * Vehicle Detail hero. Mechanically extracted from VehicleDetail.tsx (P5 Task 1,
 * verbatim — no restyle). The full-bleed photo/scrim/overlay rebuild is Task 3.
 */
export default function VehicleHero({ vehicle, photoUrl, fromCache }: VehicleHeroProps) {
  const { t } = useTranslation('vehicles')
  return (
    <div className="flex items-start space-x-3 md:space-x-4 pr-12 md:pr-0">
      {/* Vehicle Photo */}
      <div className="w-16 h-16 md:w-24 md:h-24 bg-garage-bg rounded-lg overflow-hidden flex-shrink-0">
        {photoUrl ? (
          <img src={photoUrl} alt={vehicle.nickname} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Car className="w-10 h-10 md:w-12 md:h-12 text-garage-text-muted opacity-20" />
          </div>
        )}
      </div>

      {/* Vehicle Info */}
      <div className="min-w-0">
        <Link
          to="/"
          className="inline-flex items-center space-x-1 text-sm text-garage-text-muted hover:text-garage-text transition-colors mb-2"
        >
          <ArrowLeft className="w-3 h-3" />
          <span>{t('detail.backToGarage')}</span>
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold text-garage-text mb-1">{vehicle.nickname}</h1>
        <p className="text-garage-text-muted mb-2">
          {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-garage-text-muted font-mono text-xs [overflow-wrap:anywhere]">{vehicle.vin}</span>
          <span className="px-2 py-1 bg-garage-bg text-garage-text text-xs font-medium rounded flex-shrink-0">
            {vehicle.vehicle_type}
          </span>
          {vehicle.sold_date && (
            <span className="px-2 py-1 bg-warning/10 text-warning text-xs font-medium rounded flex-shrink-0">
              {t('vehicleCard.sold')}
            </span>
          )}
        </div>
        {fromCache && (
          <div className="mt-2 flex items-center gap-2 text-xs text-amber-500">
            <AlertTriangle className="w-4 h-4" />
            <span>{t('detail.offlineCachedData')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
