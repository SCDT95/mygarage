import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Calendar, FileText, Radio } from 'lucide-react'
import type { Vehicle } from '../../types/vehicle'
import type { LastLocation } from '../../types/trips'
import { formatCurrency } from '../../utils/formatUtils'
import { UnitFormatter } from '../../utils/units'
import { useUnitPreference } from '../../hooks/useUnitPreference'
import { formatDateForDisplay } from '../../utils/dateUtils'
import { useCurrencyPreference } from '../../hooks/useCurrencyPreference'
import { useDateLocale } from '../../hooks/useDateLocale'
import { useTimeFormat } from '../../hooks/useTimeFormat'
import { formatDateTime } from '../../utils/parseAPITimestamp'
import TransferHistorySection from '../TransferHistorySection'

// Lazy-load map component — keeps Leaflet's ~150KB out of the main bundle
const LastLocationMap = lazy(() => import('../maps/LastLocationMap'))

interface VehicleOverviewTabProps {
  vin: string
  vehicle: Vehicle
  lastLocation: LastLocation | null
  onOpenModal: (modal: 'torqueSource' | 'windowSticker') => void
  onDownloadWindowSticker: () => void
}

/**
 * Vehicle Detail Overview tab content. Mechanically extracted from
 * VehicleDetail.tsx (P5 Task 1, verbatim — no restyle). Equipment expand/scroll
 * wiring lands in Task 4; the Card/CardHeader/Mono restyle lands in Task 7.
 */
export default function VehicleOverviewTab({
  vin, vehicle, lastLocation, onOpenModal, onDownloadWindowSticker,
}: VehicleOverviewTabProps) {
  const { t } = useTranslation('vehicles')
  const { system: unitSystem } = useUnitPreference()
  const dateLocale = useDateLocale()
  const { currencyCode, locale } = useCurrencyPreference()
  const { timeFormat } = useTimeFormat()

  // Recomputed locally (was VehicleDetail.tsx:444) — the Overview reads it for
  // the VIN-decoded / powertrain / non-motorized-fuel-type gates.
  const isMotorized =
    vehicle.vehicle_type &&
    !['Trailer', 'FifthWheel', 'TravelTrailer'].includes(vehicle.vehicle_type)

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return t('detail.notSpecified')
    return formatDateForDisplay(dateString, { year: 'numeric', month: 'long', day: 'numeric' }, dateLocale)
  }

  const formatStickerValue = (raw: unknown): string | null => {
    const text = Array.isArray(raw) ? raw.join(', ') : typeof raw === 'string' ? raw : null
    if (!text) return null
    return /^\d+(\.\d+)?$/.test(text)
      ? formatCurrency(text, { currencyCode, locale, zeroIsValid: true })
      : text
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Basic Information */}
      <div className="bg-garage-surface rounded-lg border border-garage-border p-6 break-inside-avoid">
        <h2 className="text-xl font-semibold text-garage-text mb-4">{t('detail.basicInformation')}</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-garage-text-muted">{t('edit.year')}</p>
              <p className="text-garage-text font-medium">{vehicle.year || t('detail.notSpecified')}</p>
            </div>
            <div>
              <p className="text-sm text-garage-text-muted">{t('edit.make')}</p>
              <p className="text-garage-text font-medium">{vehicle.make || t('detail.notSpecified')}</p>
            </div>
            <div>
              <p className="text-sm text-garage-text-muted">{t('edit.model')}</p>
              <p className="text-garage-text font-medium">{vehicle.model || t('detail.notSpecified')}</p>
            </div>
            <div>
              <p className="text-sm text-garage-text-muted">{t('detail.misc.exteriorColor')}</p>
              <p className="text-garage-text font-medium">{vehicle.exterior_color || vehicle.color || t('detail.notSpecified')}</p>
            </div>
            {vehicle.interior_color && (
              <div>
                <p className="text-sm text-garage-text-muted">{t('detail.misc.interiorColor')}</p>
                <p className="text-garage-text font-medium">{vehicle.interior_color}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-garage-text-muted">{t('edit.licensePlate')}</p>
              <p className="text-garage-text font-medium">{vehicle.license_plate || t('detail.notSpecified')}</p>
            </div>
            <div>
              <p className="text-sm text-garage-text-muted">{t('wizard.vin')}</p>
              <p className="text-garage-text font-mono text-sm">{vehicle.vin}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Purchase Information */}
      <div className="bg-garage-surface rounded-lg border border-garage-border p-6 break-inside-avoid">
        <h2 className="text-xl font-semibold text-garage-text mb-4">{t('detail.purchaseInformation')}</h2>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-garage-text-muted flex items-center space-x-2">
              <Calendar className="w-4 h-4" />
              <span>{t('edit.purchaseDate')}</span>
            </p>
            <p className="text-garage-text font-medium mt-1">{formatDate(vehicle.purchase_date)}</p>
          </div>
          <div>
            <p className="text-sm text-garage-text-muted">
              <span>{t('edit.purchasePrice')}</span>
            </p>
            <p className="text-garage-text font-medium mt-1">{formatCurrency(vehicle.purchase_price, { currencyCode, locale, fallback: t('detail.notSpecified') })}</p>
          </div>
        </div>
      </div>

      {/* Sale Information (if sold) */}
      {vehicle.sold_date && (
        <div className="bg-garage-surface rounded-lg border border-warning p-6 break-inside-avoid">
          <h2 className="text-xl font-semibold text-garage-text mb-4">{t('detail.saleInformation')}</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-garage-text-muted flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <span>{t('detail.misc.saleDate')}</span>
              </p>
              <p className="text-garage-text font-medium mt-1">{formatDate(vehicle.sold_date)}</p>
            </div>
            <div>
              <p className="text-sm text-garage-text-muted">
                <span>{t('detail.misc.salePrice')}</span>
              </p>
              <p className="text-garage-text font-medium mt-1">{formatCurrency(vehicle.sold_price, { currencyCode, locale, fallback: t('detail.notSpecified') })}</p>
            </div>
          </div>
        </div>
      )}

      {/* Connected Devices — owner-reachable Torque Pro source registration (R1-H6).
          Lives here (not the admin-gated LiveLinkSettingsModal, and not inside the
          LiveLink primary tab, which stays hidden until a device exists) so an owner
          can register a source before any device is linked. */}
      <div className="bg-garage-surface rounded-lg border border-garage-border p-6 break-inside-avoid">
        <h2 className="text-xl font-semibold text-garage-text mb-4">{t('detail.connectedDevices')}</h2>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-garage-text-muted">
              {t('forms:modal.torque.description')}
            </p>
          </div>
          <button
            onClick={() => onOpenModal('torqueSource')}
            className="flex items-center gap-2 px-4 py-2 btn btn-primary rounded-lg shrink-0"
            title={t('forms:modal.torque.launchButtonTooltip')}
          >
            <Radio className="w-4 h-4" />
            <span>{t('forms:modal.torque.launchButton')}</span>
          </button>
        </div>
      </div>

      {/* Last Known Location — "Last seen here" mini-map (Task 16). Gated on a
          last location existing. This is the one place a Torque Pro last-location
          shows even before the LiveLink primary tab exists (it stays hidden until
          a device is linked), since the Overview tab is always present. */}
      {lastLocation != null && (
        <div className="bg-garage-surface rounded-lg border border-garage-border p-6 break-inside-avoid">
          <h2 className="text-xl font-semibold text-garage-text mb-4">{t('detail.lastLocation')}</h2>
          <Suspense fallback={<div className="h-[220px] bg-garage-bg rounded-lg animate-pulse" />}>
            <LastLocationMap latitude={lastLocation.latitude} longitude={lastLocation.longitude} />
          </Suspense>
          <p className="text-sm text-garage-text-muted mt-3">
            {t('detail.lastLocationSeenAt', {
              time: formatDateTime(lastLocation.timestamp, timeFormat),
            })}
          </p>
        </div>
      )}

      {/* Transfer History */}
      <TransferHistorySection vin={vehicle.vin} />

      {/* VIN Decoded Information */}
      {(vehicle.trim || vehicle.body_class || vehicle.drive_type || vehicle.doors || vehicle.gvwr_class || vehicle.wheel_specs || vehicle.tire_specs || (!isMotorized && vehicle.fuel_type)) && (
        <div className="bg-garage-surface rounded-lg border border-garage-border p-6 break-inside-avoid">
          <h2 className="text-xl font-semibold text-garage-text mb-4">{t('detail.vehicleDetails')}</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {vehicle.trim && (
                <div>
                  <p className="text-sm text-garage-text-muted">{t('edit.trim')}</p>
                  <p className="text-garage-text font-medium">{vehicle.trim}</p>
                </div>
              )}
              {vehicle.body_class && (
                <div>
                  <p className="text-sm text-garage-text-muted">{t('edit.bodyClass')}</p>
                  <p className="text-garage-text font-medium">{vehicle.body_class}</p>
                </div>
              )}
              {vehicle.drive_type && (
                <div>
                  <p className="text-sm text-garage-text-muted">{t('edit.driveType')}</p>
                  <p className="text-garage-text font-medium">{vehicle.drive_type}</p>
                </div>
              )}
              {vehicle.doors && (
                <div>
                  <p className="text-sm text-garage-text-muted">{t('edit.doors')}</p>
                  <p className="text-garage-text font-medium">{vehicle.doors}</p>
                </div>
              )}
              {vehicle.gvwr_class && (
                <div>
                  <p className="text-sm text-garage-text-muted">{t('detail.misc.gvwrClass')}</p>
                  <p className="text-garage-text font-medium">{vehicle.gvwr_class}</p>
                </div>
              )}
              {vehicle.wheel_specs && (
                <div>
                  <p className="text-sm text-garage-text-muted">{t('detail.misc.wheels')}</p>
                  <p className="text-garage-text font-medium">{vehicle.wheel_specs}</p>
                </div>
              )}
              {vehicle.tire_specs && (
                <div>
                  <p className="text-sm text-garage-text-muted">{t('detail.misc.tires')}</p>
                  <p className="text-garage-text font-medium">{vehicle.tire_specs}</p>
                </div>
              )}
              {/* Show fuel type in Vehicle Details for non-motorized vehicles (e.g., propane for fifth wheels) */}
              {!isMotorized && vehicle.fuel_type && (
                <div>
                  <p className="text-sm text-garage-text-muted">{t('edit.fuelType')}</p>
                  <p className="text-garage-text font-medium">{vehicle.fuel_type}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Powertrain (Engine & Transmission) - Only show for motorized vehicles */}
      {isMotorized && (vehicle.displacement_l || vehicle.cylinders || vehicle.fuel_type || vehicle.sticker_engine_description || vehicle.transmission_type || vehicle.transmission_speeds || vehicle.sticker_transmission_description || vehicle.sticker_drivetrain) && (
        <div className="bg-garage-surface rounded-lg border border-garage-border p-6 break-inside-avoid">
          <h2 className="text-xl font-semibold text-garage-text mb-4">{t('detail.powertrain')}</h2>
          <div className="space-y-3">
            {/* Engine Section */}
            {(vehicle.displacement_l || vehicle.cylinders || vehicle.fuel_type || vehicle.sticker_engine_description) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {vehicle.sticker_engine_description && (
                  <div className="md:col-span-2">
                    <p className="text-sm text-garage-text-muted">{t('detail.misc.engine')}</p>
                    <p className="text-garage-text font-medium">{vehicle.sticker_engine_description}</p>
                  </div>
                )}
                {vehicle.displacement_l && (
                  <div>
                    <p className="text-sm text-garage-text-muted">{t('detail.misc.displacement')}</p>
                    <p className="text-garage-text font-medium">{t('detail.misc.displacementLiters', { value: vehicle.displacement_l })}</p>
                  </div>
                )}
                {vehicle.cylinders && (
                  <div>
                    <p className="text-sm text-garage-text-muted">{t('edit.cylinders')}</p>
                    <p className="text-garage-text font-medium">{vehicle.cylinders}</p>
                  </div>
                )}
                {vehicle.fuel_type && (
                  <div>
                    <p className="text-sm text-garage-text-muted">{t('edit.fuelType')}</p>
                    <p className="text-garage-text font-medium">{vehicle.fuel_type}</p>
                  </div>
                )}
              </div>
            )}

            {/* Transmission Section */}
            {(vehicle.transmission_type || vehicle.transmission_speeds || vehicle.sticker_transmission_description) && (
              <div className={(vehicle.displacement_l || vehicle.cylinders || vehicle.fuel_type || vehicle.sticker_engine_description) ? 'pt-3 border-t border-garage-border' : ''}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {vehicle.sticker_transmission_description && (
                    <div className="md:col-span-2">
                      <p className="text-sm text-garage-text-muted">{t('detail.misc.transmission')}</p>
                      <p className="text-garage-text font-medium">{vehicle.sticker_transmission_description}</p>
                    </div>
                  )}
                  {vehicle.transmission_type && (
                    <div>
                      <p className="text-sm text-garage-text-muted">{t('detail.misc.type')}</p>
                      <p className="text-garage-text font-medium">{vehicle.transmission_type}</p>
                    </div>
                  )}
                  {vehicle.transmission_speeds && (
                    <div>
                      <p className="text-sm text-garage-text-muted">{t('detail.misc.speeds')}</p>
                      <p className="text-garage-text font-medium">{vehicle.transmission_speeds}</p>
                    </div>
                  )}
                  {vehicle.sticker_drivetrain && (
                    <div>
                      <p className="text-sm text-garage-text-muted">{t('detail.misc.drivetrain')}</p>
                      <p className="text-garage-text font-medium">{vehicle.sticker_drivetrain}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MSRP & Pricing */}
      {(vehicle.msrp_base || vehicle.msrp_options || vehicle.msrp_total || vehicle.destination_charge) && (
        <div className="bg-garage-surface rounded-lg border border-garage-border p-6 break-inside-avoid">
          <h2 className="text-xl font-semibold text-garage-text mb-4">{t('detail.msrpPricing')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vehicle.msrp_base && (
              <div>
                <p className="text-sm text-garage-text-muted">{t('detail.misc.basePrice')}</p>
                <p className="text-garage-text font-medium">{formatCurrency(vehicle.msrp_base, { currencyCode, locale })}</p>
              </div>
            )}
            {vehicle.msrp_options && (
              <div>
                <p className="text-sm text-garage-text-muted">{t('detail.misc.options')}</p>
                <p className="text-garage-text font-medium">{formatCurrency(vehicle.msrp_options, { currencyCode, locale })}</p>
              </div>
            )}
            {vehicle.destination_charge && (
              <div>
                <p className="text-sm text-garage-text-muted">{t('detail.misc.destination')}</p>
                <p className="text-garage-text font-medium">{formatCurrency(vehicle.destination_charge, { currencyCode, locale })}</p>
              </div>
            )}
            {vehicle.msrp_total && (
              <div>
                <p className="text-sm text-garage-text-muted">{t('detail.misc.totalMsrp')}</p>
                <p className="text-garage-text font-medium text-lg">{formatCurrency(vehicle.msrp_total, { currencyCode, locale })}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fuel Economy */}
      {(vehicle.fuel_economy_city_l_per_100km || vehicle.fuel_economy_highway_l_per_100km || vehicle.fuel_economy_combined_l_per_100km) && (
        <div className="bg-garage-surface rounded-lg border border-garage-border p-6 break-inside-avoid">
          <h2 className="text-xl font-semibold text-garage-text mb-4">{t('detail.fuelEconomy')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {vehicle.fuel_economy_city_l_per_100km && (
              <div>
                <p className="text-sm text-garage-text-muted">{t('detail.misc.city')}</p>
                <p className="text-garage-text font-medium">{UnitFormatter.formatFuelEconomy(parseFloat(vehicle.fuel_economy_city_l_per_100km), unitSystem)}</p>
              </div>
            )}
            {vehicle.fuel_economy_highway_l_per_100km && (
              <div>
                <p className="text-sm text-garage-text-muted">{t('detail.misc.highway')}</p>
                <p className="text-garage-text font-medium">{UnitFormatter.formatFuelEconomy(parseFloat(vehicle.fuel_economy_highway_l_per_100km), unitSystem)}</p>
              </div>
            )}
            {vehicle.fuel_economy_combined_l_per_100km && (
              <div>
                <p className="text-sm text-garage-text-muted">{t('detail.misc.combined')}</p>
                <p className="text-garage-text font-medium">{UnitFormatter.formatFuelEconomy(parseFloat(vehicle.fuel_economy_combined_l_per_100km), unitSystem)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Warranty */}
      {(vehicle.warranty_powertrain || vehicle.warranty_basic) && (
        <div className="bg-garage-surface rounded-lg border border-garage-border p-6 break-inside-avoid">
          <h2 className="text-xl font-semibold text-garage-text mb-4">{t('detail.warranty')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vehicle.warranty_basic && (
              <div>
                <p className="text-sm text-garage-text-muted">{t('detail.misc.basic')}</p>
                <p className="text-garage-text font-medium">{vehicle.warranty_basic}</p>
              </div>
            )}
            {vehicle.warranty_powertrain && (
              <div>
                <p className="text-sm text-garage-text-muted">{t('detail.powertrain')}</p>
                <p className="text-garage-text font-medium">{vehicle.warranty_powertrain}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Environmental Ratings */}
      {(vehicle.environmental_rating_ghg || vehicle.environmental_rating_smog) && (
        <div className="bg-garage-surface rounded-lg border border-garage-border p-6 break-inside-avoid">
          <h2 className="text-xl font-semibold text-garage-text mb-4">{t('detail.environmentalRatings')}</h2>
          <div className="grid grid-cols-2 gap-4">
            {vehicle.environmental_rating_ghg && (
              <div>
                <p className="text-sm text-garage-text-muted">{t('detail.misc.ghgRating')}</p>
                <p className="text-garage-text font-medium">{vehicle.environmental_rating_ghg}</p>
              </div>
            )}
            {vehicle.environmental_rating_smog && (
              <div>
                <p className="text-sm text-garage-text-muted">{t('detail.misc.smogRating')}</p>
                <p className="text-garage-text font-medium">{vehicle.environmental_rating_smog}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Assembly Location */}
      {vehicle.assembly_location && (
        <div className="bg-garage-surface rounded-lg border border-garage-border p-6 break-inside-avoid">
          <h2 className="text-xl font-semibold text-garage-text mb-4">{t('detail.manufacturing')}</h2>
          <div>
            <p className="text-sm text-garage-text-muted">{t('detail.misc.assemblyLocation')}</p>
            <p className="text-garage-text font-medium">{vehicle.assembly_location}</p>
          </div>
        </div>
      )}

      {/* Standard Equipment - Collapsible */}
      {vehicle.standard_equipment && typeof vehicle.standard_equipment === 'object' && Object.keys(vehicle.standard_equipment).length > 0 && (
        <details className="bg-garage-surface rounded-lg border border-garage-border p-6 break-inside-avoid group">
          <summary className="text-xl font-semibold text-garage-text cursor-pointer list-none flex items-center justify-between">
            <span>{t('detail.standardEquipment')}</span>
            <span className="text-sm font-normal text-garage-text-muted group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="space-y-3 mt-4">
            {Object.entries(vehicle.standard_equipment).map(([category, items]) => (
              <div key={category}>
                {/* Hide "items" category header - it's just a container */}
                {category !== 'items' && (
                  <p className="text-sm font-medium text-primary mb-2">{category}</p>
                )}
                {Array.isArray(items) ? (
                  <ul className="list-disc list-inside space-y-1">
                    {items.map((item, idx) => (
                      <li key={idx} className="text-sm text-garage-text">{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-garage-text">{String(items)}</p>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Optional Equipment with Pricing - Collapsible */}
      {vehicle.optional_equipment && typeof vehicle.optional_equipment === 'object' && Object.keys(vehicle.optional_equipment).length > 0 && (
        <details className="bg-garage-surface rounded-lg border border-garage-border p-6 break-inside-avoid group">
          <summary className="text-xl font-semibold text-garage-text cursor-pointer list-none flex items-center justify-between">
            <span>{t('detail.optionalEquipment')}</span>
            <span className="text-sm font-normal text-garage-text-muted group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="space-y-2 mt-4">
            {Object.entries(vehicle.optional_equipment).map(([category, items]) => (
              <div key={category}>
                {/* Hide "items" category header - it's just a container */}
                {category !== 'items' && (
                  <p className="text-sm font-medium text-primary mb-2">{category}</p>
                )}
                {Array.isArray(items) ? (
                  <ul className="space-y-1">
                    {(items as string[]).map((item, idx) => {
                      const price = formatStickerValue(vehicle.window_sticker_options_detail?.[item])
                      return (
                        <li key={idx} className="text-sm text-garage-text flex justify-between">
                          <span>{item}</span>
                          {price && <span className="text-garage-text-muted">{price}</span>}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-garage-text">{String(items)}</p>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Packages */}
      {vehicle.window_sticker_packages && typeof vehicle.window_sticker_packages === 'object' && Object.keys(vehicle.window_sticker_packages).length > 0 && (
        <div className="bg-garage-surface rounded-lg border border-garage-border p-6 break-inside-avoid">
          <h2 className="text-xl font-semibold text-garage-text mb-4">{t('detail.packages')}</h2>
          <div className="space-y-2">
            {Object.entries(vehicle.window_sticker_packages).map(([packageName, rawValue]) => {
              const value = formatStickerValue(rawValue)
              return (
                <div key={packageName} className="flex justify-between items-center">
                  <span className="text-sm text-garage-text">{packageName}</span>
                  {value && <span className="text-sm text-garage-text-muted">{value}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Window Sticker - Only show for cars/trucks */}
      {vehicle.vehicle_type && ['Car', 'Truck', 'SUV'].includes(vehicle.vehicle_type) && (
        <div className="bg-garage-surface rounded-lg border border-garage-border p-6 break-inside-avoid">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-garage-text">{t('detail.windowSticker')}</h2>
            <Link
              to={`/vehicles/${vin}/window-sticker-test`}
              className="text-xs px-2 py-1 bg-garage-bg rounded text-garage-text-muted hover:text-primary transition-colors"
            >
              {t('detail.misc.testOcr')}
            </Link>
          </div>
          {vehicle.window_sticker_file_path ? (
            <div className="space-y-3">
              <button
                onClick={onDownloadWindowSticker}
                className="w-full group cursor-pointer"
              >
                <div className="h-20 bg-garage-bg rounded-lg border border-garage-border overflow-hidden flex items-center justify-center gap-3 hover:bg-garage-border/30 transition-colors">
                  <FileText className="w-8 h-8 text-primary" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-garage-text">{t('detail.viewWindowSticker')}</p>
                    <p className="text-xs text-garage-text-muted">{t('detail.clickToOpenPDF')}</p>
                  </div>
                </div>
              </button>
              {/* OCR Metadata */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-garage-text-muted">
                {vehicle.window_sticker_parser_used && (
                  <span>{t('detail.misc.parser', { parser: vehicle.window_sticker_parser_used })}</span>
                )}
                {vehicle.window_sticker_confidence_score && (
                  <span>{t('detail.misc.confidence', { score: Number(vehicle.window_sticker_confidence_score).toFixed(0) })}</span>
                )}
                {vehicle.window_sticker_extracted_vin && (
                  <span className={vehicle.window_sticker_extracted_vin === vehicle.vin ? 'text-success' : 'text-warning'}>
                    {vehicle.window_sticker_extracted_vin === vehicle.vin
                      ? `✓ ${t('detail.misc.vinVerified')}`
                      : `⚠ ${t('detail.misc.vinMismatch')}`}
                  </span>
                )}
              </div>
              <button
                onClick={() => onOpenModal('windowSticker')}
                className="text-sm text-garage-text-muted hover:text-garage-text transition-colors"
              >
                {t('detail.replaceSticker')}
              </button>
            </div>
          ) : (
            <div className="text-center py-4">
              <FileText className="w-10 h-10 text-garage-text-muted mx-auto mb-2 opacity-50" />
              <p className="text-sm text-garage-text-muted mb-3">{t('detail.noWindowSticker')}</p>
              <button
                onClick={() => onOpenModal('windowSticker')}
                className="px-4 py-2 bg-primary text-(--accent-on-solid) rounded-lg hover:bg-primary/90 transition-colors text-sm"
              >
                {t('detail.uploadWindowSticker')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
