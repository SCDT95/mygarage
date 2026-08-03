import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save, Droplets, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import FormModalWrapper from '../FormModalWrapper'
import { Button, Checkbox, Field, Input, Select } from '../ui'
import CurrencyInputPrefix from '../common/CurrencyInputPrefix'
import vehicleService from '../../services/vehicleService'
import type { Vehicle, VehicleUpdate } from '../../types/vehicle'
import { vehicleEditSchema, type VehicleEditFormData, VEHICLE_TYPES } from '../../schemas/vehicle'
import { FUEL_TYPE_VALUES, FUEL_TYPE_LABELS, isDieselFuelType } from '../../constants/fuel'
import { useUnitPreference } from '../../hooks/useUnitPreference'
import { UnitConverter, UnitFormatter } from '../../utils/units'
import { toCanonicalLiters } from '../../utils/decimalSafe'
import { getUsageTracking } from '../../utils/usageTracking'

/** Vehicles with no engine, VIN-decoded drivetrain, or DEF system. */
const NON_MOTORIZED_TYPES = ['Trailer', 'FifthWheel', 'TravelTrailer']

const CURRENCY_INPUT_CLASS =
  'ui-focus-input ui-motion w-full rounded-control border bg-surface-2 pl-7 pr-3 py-2 text-sm text-text font-mono tabular-nums'

interface VehicleEditDrawerProps {
  open: boolean
  onClose: () => void
  vin: string
  vehicle: Vehicle
  /** Receives the server's updated vehicle after a successful save. */
  onUpdated: (vehicle: Vehicle) => void
}

/**
 * Vehicle edit sidecar — the former /vehicles/:vin/edit page.
 *
 * The form logic is carried over verbatim from that page: react-hook-form +
 * vehicleEditSchema, the seed effect's `[open]`-only dependency array (below —
 * it must not re-run just because `t` got a new identity, or a language switch
 * mid-edit would discard everything typed), the DEF enable/clear state machine,
 * the canonical-litres conversion, and the motorized branch. What changed is the
 * surface (a Drawer, not a route) and the save tail — the page ended with
 * `window.location.href` for a hard reload; here the parent applies the saved
 * vehicle in place.
 *
 * The legacy `color` column is deliberately NOT edited here. The Basic
 * Information card writes `exterior_color`, display resolves
 * `exterior_color || color`, so a colour typed here would silently not appear
 * whenever the sticker/card value is set. Omitting the field is safe because
 * `optionalStringSchema` puts `.optional()` outside the transform — an
 * unregistered key short-circuits to `undefined`, JSON.stringify drops it, and
 * the backend's `exclude_unset=True` leaves the column untouched.
 */
export default function VehicleEditDrawer({
  open,
  onClose,
  vin,
  vehicle,
  onUpdated,
}: VehicleEditDrawerProps) {
  const { t } = useTranslation('vehicles')
  const [defEnabled, setDefEnabled] = useState(false)
  // The vehicle the form is actually seeded from (the fresh refetch, or the
  // prop fallback if that refetch fails) — null until the seed resolves.
  // Render-time gates (isMotorized, the non-motorized fuel section) must read
  // THIS, not the `vehicle` prop: the prop can disagree with the fresh fetch
  // on motorization, and gating a section on stale truth while seeding form
  // values from fresh truth registers fields the fresh data never populates —
  // `reset()` then submits them as explicit `null`, clearing real columns.
  const [seedSource, setSeedSource] = useState<Vehicle | null>(null)
  const { system } = useUnitPreference()

  const isMotorized = seedSource ? !NON_MOTORIZED_TYPES.includes(seedSource.vehicle_type) : false

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
    watch,
  } = useForm<VehicleEditFormData>({
    resolver: zodResolver(vehicleEditSchema) as Resolver<VehicleEditFormData>,
    defaultValues: {},
  })

  // Which usage dimension(s) the form is currently configured for — primary
  // (usage_unit) plus the also-track toggle. Drives the Current Hours field's
  // visibility: it shows for hours-primary AND distance-primary+secondary
  // ("dual") vehicles, not just usage_unit === 'hours'.
  const usageTracking = getUsageTracking({
    usage_unit: watch('usage_unit'),
    secondary_usage_enabled: watch('secondary_usage_enabled'),
  })

  const watchedFuelType = watch('fuel_type')
  // The currently-selected (not saved) fuel type — drives DEF capacity gating
  // so switching the dropdown updates the UI immediately, mirroring the
  // server's diesel-only DEF capacity rule.
  const isDieselSelected = isDieselFuelType(watchedFuelType)

  // Shared by the "Enable DEF Tracking" checkbox and the "Clear DEF Tank
  // Capacity" hint button — both turn tracking off and drop any stored value.
  const clearDefTracking = () => {
    setDefEnabled(false)
    setValue('def_tank_capacity_liters', undefined)
  }

  const seedForm = useCallback(async () => {
    // The `vehicle` prop can be stale: VehicleDetail fetches it once on mount
    // and, offline, falls back to a localStorage cache of arbitrary age.
    // MyGarage has multi-user vehicle sharing, so seeding a PUT of ~20 fields
    // from a stale read is a silent lost-update path. Refetch fresh, mirroring
    // the full-page editor this drawer replaced. detail-stats is a
    // supplementary read-aggregation (latest_hours, secondary_usage_enabled)
    // — its failure must not block the editor, so it swallows its own error
    // and the affected fields simply seed empty. The vehicle refetch gets the
    // same treatment: fall back to the prop if it fails (offline, transient
    // 5xx) — a stale seed still beats refusing to open the editor.
    const [fresh, detailStats] = await Promise.all([
      vehicleService.get(vin).catch(() => null),
      vehicleService.getDetailStats(vin).catch(() => null),
    ])
    const source = fresh ?? vehicle
    const vehicleIsMotorized = !NON_MOTORIZED_TYPES.includes(source.vehicle_type)

    const formData: Record<string, unknown> = {
      nickname: source.nickname,
      license_plate: source.license_plate,
      vehicle_type: source.vehicle_type,
      usage_unit: source.usage_unit ?? 'distance',
      secondary_usage_enabled: detailStats?.secondary_usage_enabled ?? false,
      // R2-H1: `vehicle.current_hours` (the raw column) is retired as a read
      // source — it is no longer written on save, so it goes stale the moment
      // a fuel or service record carries a newer reading. Seed from the derived
      // latest reading; if detail-stats has none, leave it empty.
      current_hours: detailStats?.latest_hours != null ? Number(detailStats.latest_hours) : null,
      year: source.year,
      make: source.make,
      model: source.model,
      purchase_date: source.purchase_date,
      purchase_price: source.purchase_price,
      sold_date: source.sold_date,
      sold_price: source.sold_price,
      // Always included (propane on fifth wheels).
      fuel_type: source.fuel_type,
      def_tank_capacity_liters: (() => {
        const cap = source.def_tank_capacity_liters
        if (cap == null) return undefined
        const num = typeof cap === 'string' ? parseFloat(cap) : Number(cap)
        if (isNaN(num)) return undefined
        return system === 'imperial' ? UnitConverter.litersToGallons(num) ?? num : num
      })(),
    }

    // DEF enabled follows the stored capacity, not the fuel type; the diesel
    // hint covers the suggestion when tracking is off.
    const hasTankCap =
      source.def_tank_capacity_liters != null && Number(source.def_tank_capacity_liters) > 0
    setDefEnabled(hasTankCap)

    // Non-motorized vehicles have no VIN-decoded or engine fields; leaving the
    // keys absent is load-bearing (see schemas/vehicle.ts — an omitted key
    // short-circuits to undefined rather than a column-clearing null).
    if (vehicleIsMotorized) {
      formData.trim = source.trim
      formData.body_class = source.body_class
      formData.drive_type = source.drive_type
      formData.doors = source.doors
      formData.gvwr_class = source.gvwr_class
      formData.displacement_l = source.displacement_l
      formData.cylinders = source.cylinders
      formData.transmission_type = source.transmission_type
      formData.transmission_speeds = source.transmission_speeds
    }

    // Publish the resolved source before reset() so the render-time gates
    // (isMotorized, the fuel section) and the field values they admit change
    // together, in the same tick — never gate on one snapshot while seeding
    // from another.
    setSeedSource(source)
    reset(formData as VehicleEditFormData)
  }, [vin, vehicle, reset, system])

  // Reseed on each open transition only. Deliberately NOT keyed on `vehicle`:
  // the parent re-setting it while the drawer is open would reset the form
  // under the user. Mirrors PricingDrawer / VehicleFieldsDrawer. Clearing
  // `seedSource` on close (rather than leaving the last one behind) forces a
  // reopen to render nothing until it reseeds — the same "don't render
  // against stale truth" guarantee the initial open gets.
  useEffect(() => {
    if (open) seedForm()
    else setSeedSource(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onSubmit = async (data: VehicleEditFormData) => {
    // DEF tracking on but no capacity entered → tiny positive sentinel
    // (canonical litres). Off → explicit null to clear the column.
    if (defEnabled && (!data.def_tank_capacity_liters || data.def_tank_capacity_liters <= 0)) {
      data.def_tank_capacity_liters = 0.01
    }
    if (!defEnabled) {
      data.def_tank_capacity_liters = null
    } else if (data.def_tank_capacity_liters != null) {
      // The entered value is in the user's display unit (L metric, gal
      // imperial). Convert to canonical litres before submit.
      const canonical = toCanonicalLiters(data.def_tank_capacity_liters, system)
      data.def_tank_capacity_liters = canonical ?? data.def_tank_capacity_liters
    }

    try {
      const updated = await vehicleService.update(vin, data as VehicleUpdate)
      onUpdated(updated)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('vehicleEditPage.genericError'))
    }
  }

  const fuelOptions = FUEL_TYPE_VALUES.map((value) => ({
    value,
    label: t(`forms:fuel.fuelTypes.${value}`, { defaultValue: FUEL_TYPE_LABELS[value] }),
  }))

  return (
    <FormModalWrapper
      isOpen={open}
      onClose={onClose}
      title={t('edit.title')}
      icon={Pencil}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('common:cancel')}
          </Button>
          <Button
            type="submit"
            form="vehicle-edit-form"
            variant="primary"
            icon={Save}
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            {isSubmitting ? t('common:saving') : t('edit.saveChanges')}
          </Button>
        </>
      }
    >
      {!seedSource ? (
        // Nothing renders — and no field registers — until the seed resolves.
        // Rendering the form against the `vehicle` prop while a fresh
        // motorization verdict is still in flight is exactly the bug this
        // gate exists to prevent: a section mounting on stale truth registers
        // fields the fresh seed never populates, and reset() then submits
        // those as explicit `null`, clearing real columns.
        <div className="flex items-center justify-center p-6 text-sm text-text-mute">
          {t('common:loading')}
        </div>
      ) : (
      <form id="vehicle-edit-form" onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
        {/* Basic Information */}
        <section>
          <h3 className="mb-4 text-lg font-semibold text-text">{t('edit.basicInformation')}</h3>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <Field id="nickname" label={t('edit.nickname')} required error={errors.nickname}>
              <Input
                id="nickname"
                type="text"
                {...register('nickname')}
                placeholder={t('vehicleEditPage.nicknamePlaceholder')}
                invalid={!!errors.nickname}
                disabled={isSubmitting}
              />
            </Field>

            <Field id="license_plate" label={t('edit.licensePlate')} error={errors.license_plate}>
              <Input
                id="license_plate"
                type="text"
                {...register('license_plate')}
                placeholder={t('vehicleEditPage.licensePlatePlaceholder')}
                invalid={!!errors.license_plate}
                disabled={isSubmitting}
              />
            </Field>

            {/* No blank option: vehicle_type is NOT NULL (the wizard's select
                has none either) — a null submit would 409 server-side and roll
                back the whole update. */}
            <Field id="vehicle_type" label={t('edit.vehicleType')} error={errors.vehicle_type}>
              <Select
                id="vehicle_type"
                {...register('vehicle_type')}
                invalid={!!errors.vehicle_type}
                disabled={isSubmitting}
                options={VEHICLE_TYPES.map((type) => ({
                  value: type,
                  label: t(`vehicleTypeLabels.${type}`, { defaultValue: type }),
                }))}
              />
            </Field>

            <Field id="usage_unit" label={t('edit.usageTracking')} error={errors.usage_unit}>
              <Select
                id="usage_unit"
                {...register('usage_unit')}
                invalid={!!errors.usage_unit}
                disabled={isSubmitting}
                options={[
                  { value: 'distance', label: t('edit.usageDistance') },
                  { value: 'hours', label: t('edit.usageHours') },
                ]}
              />
            </Field>

            <div className="mb-4 flex items-end">
              <Checkbox
                id="secondary_usage_enabled"
                {...register('secondary_usage_enabled')}
                disabled={isSubmitting}
                label={
                  watch('usage_unit') === 'hours'
                    ? t('edit.alsoTrackDistance')
                    : t('edit.alsoTrackHours')
                }
              />
            </div>

            {usageTracking.tracksHours && (
              <Field id="current_hours" label={t('edit.currentHours')} error={errors.current_hours}>
                <Input
                  id="current_hours"
                  type="number"
                  step="0.1"
                  min="0"
                  {...register('current_hours', { valueAsNumber: true })}
                  placeholder={t('vehicleEditPage.currentHoursPlaceholder')}
                  invalid={!!errors.current_hours}
                  disabled={isSubmitting}
                />
              </Field>
            )}
          </div>
        </section>

        {/* Vehicle Details */}
        <section>
          <h3 className="mb-4 text-lg font-semibold text-text">{t('edit.vehicleDetails')}</h3>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
            <Field id="year" label={t('edit.year')} error={errors.year}>
              <Input
                id="year"
                type="number"
                min="1900"
                max="2100"
                {...register('year', { valueAsNumber: true })}
                placeholder="2020"
                invalid={!!errors.year}
                disabled={isSubmitting}
              />
            </Field>

            <Field id="make" label={t('edit.make')} error={errors.make}>
              <Input
                id="make"
                type="text"
                {...register('make')}
                placeholder={t('vehicleEditPage.makePlaceholder')}
                invalid={!!errors.make}
                disabled={isSubmitting}
              />
            </Field>

            <Field id="model" label={t('edit.model')} error={errors.model}>
              <Input
                id="model"
                type="text"
                {...register('model')}
                placeholder={t('vehicleEditPage.modelPlaceholder')}
                invalid={!!errors.model}
                disabled={isSubmitting}
              />
            </Field>
          </div>
        </section>

        {/* VIN Decoded Information — motorized only */}
        {isMotorized && (
          <section>
            <h3 className="mb-4 text-lg font-semibold text-text">{t('edit.vinDecodedInfo')}</h3>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <Field id="trim" label={t('edit.trim')} error={errors.trim}>
                <Input id="trim" type="text" {...register('trim')} placeholder={t('vehicleEditPage.trimPlaceholder')} invalid={!!errors.trim} disabled={isSubmitting} />
              </Field>

              <Field id="body_class" label={t('edit.bodyClass')} error={errors.body_class}>
                <Input id="body_class" type="text" {...register('body_class')} placeholder={t('vehicleEditPage.bodyClassPlaceholder')} invalid={!!errors.body_class} disabled={isSubmitting} />
              </Field>

              <Field id="drive_type" label={t('edit.driveType')} error={errors.drive_type}>
                <Input id="drive_type" type="text" {...register('drive_type')} placeholder={t('vehicleEditPage.driveTypePlaceholder')} invalid={!!errors.drive_type} disabled={isSubmitting} />
              </Field>

              <Field id="doors" label={t('edit.doors')} error={errors.doors}>
                <Input id="doors" type="number" {...register('doors', { valueAsNumber: true })} placeholder="4" invalid={!!errors.doors} disabled={isSubmitting} />
              </Field>

              <Field id="gvwr_class" label={t('vehicleEditPage.gvwrClass')} error={errors.gvwr_class}>
                <Input id="gvwr_class" type="text" {...register('gvwr_class')} placeholder={t('vehicleEditPage.gvwrClassPlaceholder')} invalid={!!errors.gvwr_class} disabled={isSubmitting} />
              </Field>
            </div>
          </section>
        )}

        {/* Engine & Transmission — motorized only */}
        {isMotorized && (
          <section>
            <h3 className="mb-4 text-lg font-semibold text-text">{t('edit.engineTransmission')}</h3>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
              <Field id="displacement_l" label={t('edit.displacement')} error={errors.displacement_l}>
                <Input id="displacement_l" type="text" {...register('displacement_l')} placeholder="2,0" invalid={!!errors.displacement_l} disabled={isSubmitting} />
              </Field>

              <Field id="cylinders" label={t('edit.cylinders')} error={errors.cylinders}>
                <Input id="cylinders" type="number" {...register('cylinders', { valueAsNumber: true })} placeholder="4" invalid={!!errors.cylinders} disabled={isSubmitting} />
              </Field>

              <Field id="fuel_type" label={t('edit.fuelType')} error={errors.fuel_type}>
                <Select id="fuel_type" {...register('fuel_type')} invalid={!!errors.fuel_type} disabled={isSubmitting} placeholder="—" options={fuelOptions} />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <Field id="transmission_type" label={t('edit.transmissionType')} error={errors.transmission_type}>
                <Input id="transmission_type" type="text" {...register('transmission_type')} placeholder={t('vehicleEditPage.transmissionTypePlaceholder')} invalid={!!errors.transmission_type} disabled={isSubmitting} />
              </Field>

              <Field id="transmission_speeds" label={t('edit.transmissionSpeeds')} error={errors.transmission_speeds}>
                <Input id="transmission_speeds" type="text" {...register('transmission_speeds')} placeholder={t('vehicleEditPage.transmissionSpeedsPlaceholder')} invalid={!!errors.transmission_speeds} disabled={isSubmitting} />
              </Field>
            </div>
          </section>
        )}

        {/* DEF Tracking — motorized only */}
        {isMotorized && (
          <section>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-text">
              <Droplets className="h-5 w-5" aria-hidden="true" />
              {t('edit.defTracking')}
            </h3>
            <div className="space-y-4">
              <Checkbox
                id="def_enabled"
                checked={defEnabled}
                disabled={isSubmitting}
                onChange={(e) => {
                  if (e.target.checked) setDefEnabled(true)
                  else clearDefTracking()
                }}
                label={t('edit.enableDefTracking')}
              />

              {isDieselSelected && !defEnabled && (
                <p className="text-sm text-warning">{t('edit.dieselDefHint')}</p>
              )}

              {defEnabled && (
                <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                  <Field
                    id="def_tank_capacity_liters"
                    label={t('edit.defTankCapacity')}
                    unit={UnitFormatter.getVolumeUnit(system)}
                    error={errors.def_tank_capacity_liters}
                    hint={isDieselSelected ? t('edit.defTankCapacityHint') : undefined}
                  >
                    <Input
                      id="def_tank_capacity_liters"
                      type="number"
                      step="0.01"
                      min="0"
                      max="9999.99"
                      {...register('def_tank_capacity_liters', { valueAsNumber: true })}
                      disabled={isSubmitting || !isDieselSelected}
                      invalid={!!errors.def_tank_capacity_liters}
                      placeholder={system === 'imperial' ? '5.0' : '19.0'}
                    />
                    {!isDieselSelected && (
                      <div className="mt-1 space-y-1">
                        <p className="text-xs text-warning">
                          {t('edit.defCapacityRequiresDieselHint')}
                        </p>
                        <button
                          type="button"
                          onClick={clearDefTracking}
                          className="cursor-pointer text-xs text-primary hover:underline"
                        >
                          {t('edit.clearDefTankCapacity')}
                        </button>
                      </div>
                    )}
                  </Field>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Fuel type for non-motorized vehicles (e.g. propane on fifth wheels) */}
        {!isMotorized && seedSource.fuel_type && (
          <section>
            <h3 className="mb-4 text-lg font-semibold text-text">{t('edit.fuelInformation')}</h3>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <Field id="fuel_type" label={t('edit.fuelType')} error={errors.fuel_type}>
                <Select id="fuel_type" {...register('fuel_type')} invalid={!!errors.fuel_type} disabled={isSubmitting} placeholder="—" options={fuelOptions} />
              </Field>
            </div>
          </section>
        )}

        {/* Purchase Information */}
        <section>
          <h3 className="mb-4 text-lg font-semibold text-text">{t('edit.purchaseInformation')}</h3>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <Field id="purchase_date" label={t('edit.purchaseDate')} error={errors.purchase_date}>
              <Input id="purchase_date" type="date" {...register('purchase_date')} invalid={!!errors.purchase_date} disabled={isSubmitting} />
            </Field>

            <Field id="purchase_price" label={t('edit.purchasePrice')} error={errors.purchase_price}>
              <div className="relative">
                <CurrencyInputPrefix />
                <input
                  type="number"
                  id="purchase_price"
                  min="0"
                  step="0.01"
                  {...register('purchase_price', { valueAsNumber: true })}
                  placeholder="25000.00"
                  aria-invalid={errors.purchase_price ? true : undefined}
                  className={`${CURRENCY_INPUT_CLASS} ${errors.purchase_price ? 'border-danger' : 'border-border'}`}
                  disabled={isSubmitting}
                />
              </div>
            </Field>
          </div>
        </section>

        {/* Sale Information */}
        <section>
          <h3 className="mb-4 text-lg font-semibold text-text">{t('edit.saleInformation')}</h3>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <Field id="sold_date" label={t('edit.soldDate')} error={errors.sold_date}>
              <Input id="sold_date" type="date" {...register('sold_date')} invalid={!!errors.sold_date} disabled={isSubmitting} />
            </Field>

            <Field id="sold_price" label={t('edit.soldPrice')} error={errors.sold_price}>
              <div className="relative">
                <CurrencyInputPrefix />
                <input
                  type="number"
                  id="sold_price"
                  min="0"
                  step="0.01"
                  {...register('sold_price', { valueAsNumber: true })}
                  placeholder="20000.00"
                  aria-invalid={errors.sold_price ? true : undefined}
                  className={`${CURRENCY_INPUT_CLASS} ${errors.sold_price ? 'border-danger' : 'border-border'}`}
                  disabled={isSubmitting}
                />
              </div>
            </Field>
          </div>
        </section>
      </form>
      )}
    </FormModalWrapper>
  )
}
