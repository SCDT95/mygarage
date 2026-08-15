import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save } from 'lucide-react'
import FormModalWrapper from './FormModalWrapper'
import type { FuelRecord, FuelRecordCreate, FuelRecordUpdate } from '../types/fuel'
import { propaneRecordSchema, type PropaneRecordFormData } from '../schemas/propane'
import { useCreatePropaneRecord, useUpdatePropaneRecord } from '../hooks/queries/usePropaneRecords'
import { useUnitPreference } from '../hooks/useUnitPreference'
import { UnitConverter, UnitFormatter } from '../utils/units'
import { toCanonicalKg, toCanonicalLiters, priceToDisplay, priceToCanonical } from '../utils/decimalSafe'
import { formatDateForInput } from '../utils/dateUtils'
import CurrencyInputPrefix from './common/CurrencyInputPrefix'
import { Button, Field, Input, NumberInput, Select, Textarea, registerDecimal } from './ui'

// Propane density: 1 kg ≈ 1.968 L (1 gal ≈ 1.923 kg, 1 gal = 3.78541 L).
const KG_TO_LITERS = 1.968

// Tank sizes in kg (canonical). The nominal display size differs per system
// (a 9.07 kg tank is sold as "20 lb"), so both are carried here; the unit
// suffix and the "portable"/"RV" qualifier are resolved at render time via
// UnitFormatter and t() — never baked into a translation value.
const TANK_SIZES = [
  { kg: 9.07,   sizeMetric: 9,   sizeImperial: 20,  kind: 'portable' },
  { kg: 14.97,  sizeMetric: 15,  sizeImperial: 33,  kind: 'portable' },
  { kg: 45.36,  sizeMetric: 45,  sizeImperial: 100, kind: 'rv' },
  { kg: 190.51, sizeMetric: 190, sizeImperial: 420, kind: 'rv' },
] as const

interface PropaneRecordFormProps {
  vin: string
  record?: FuelRecord
  onClose: () => void
  onSuccess: () => void
}

export default function PropaneRecordForm({
  vin,
  record,
  onClose,
  onSuccess
}: PropaneRecordFormProps) {
  const { t } = useTranslation('forms')
  const isEdit = !!record
  const [error, setError] = useState<string | null>(null)
  const createMutation = useCreatePropaneRecord(vin)
  const updateMutation = useUpdatePropaneRecord(vin)
  const { system } = useUnitPreference()

  // Extract vendor from notes if it was stored there
  const extractVendor = (notes?: string): string => {
    if (!notes) return ''
    const match = notes.match(/^Vendor: (.+?)(?:\n|$)/)
    return match ? match[1] : ''
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useForm<PropaneRecordFormData>({
    resolver: zodResolver(propaneRecordSchema) as Resolver<PropaneRecordFormData>,
    defaultValues: {
      date: formatDateForInput(record?.date),
      propane_liters: (() => {
        if (record?.propane_liters == null) return undefined
        const liters = typeof record.propane_liters === 'string'
          ? parseFloat(record.propane_liters)
          : record.propane_liters
        if (isNaN(liters)) return undefined
        return system === 'imperial'
          ? UnitConverter.litersToGallons(liters) ?? undefined
          : liters
      })(),
      // Read uses the record's stored basis so legacy records saved with
      // basis='per_tank' (pre-fix bug — the form labeled the field $/gal
      // or $/L but stored the user's typed value raw under per_tank) display
      // the same value the user typed. Records saved with the corrected
      // basis='per_volume' are converted from canonical $/L to $/gal for
      // imperial users.
      price_per_unit: priceToDisplay(record?.price_per_unit, system, record?.price_basis ?? 'per_volume') ?? undefined,
      cost: (() => {
        if (!record?.cost) return undefined
        const cost = typeof record.cost === 'string'
          ? parseFloat(record.cost)
          : record.cost
        return isNaN(cost) ? undefined : cost
      })(),
      vendor: extractVendor(record?.notes ?? undefined) || '',
      notes: record?.notes?.replace(/^Vendor: .+?\n/, '') || '',
      tank_size_kg: (() => {
        if (record?.tank_size_kg == null) return undefined
        const kg = typeof record.tank_size_kg === 'string'
          ? parseFloat(record.tank_size_kg)
          : record.tank_size_kg
        if (isNaN(kg)) return undefined
        return system === 'imperial' ? UnitConverter.kgToLbs(kg) ?? undefined : kg
      })(),
      tank_quantity: record?.tank_quantity ?? undefined,
    },
  })

  // Watch volume and price for auto-calculation
  const propaneVolume = watch('propane_liters')
  const pricePerUnit = watch('price_per_unit')
  const tankSizeDisplay = watch('tank_size_kg')
  const tankQuantity = watch('tank_quantity')

  const [isInitialMount, setIsInitialMount] = useState(true)

  useEffect(() => {
    if (isInitialMount) {
      setIsInitialMount(false)
      return
    }

    if (propaneVolume && pricePerUnit) {
      const volNum = typeof propaneVolume === 'number' ? propaneVolume : parseFloat(String(propaneVolume))
      const priceNum = typeof pricePerUnit === 'number' ? pricePerUnit : parseFloat(String(pricePerUnit))

      if (!isNaN(volNum) && !isNaN(priceNum)) {
        const total = volNum * priceNum
        setValue('cost', parseFloat(total.toFixed(2)))
      }
    }
  }, [propaneVolume, pricePerUnit, setValue, isInitialMount])

  // Auto-calculate propane volume from tank data.
  // tank_size_kg field actually holds the user's displayed tank weight (kg or lb).
  useEffect(() => {
    if (isInitialMount) return

    if (tankSizeDisplay && tankQuantity) {
      const tankNum = parseFloat(tankSizeDisplay.toString())
      // Convert to canonical kg, then to liters via density, then back to user's
      // displayed volume unit.
      const kg = system === 'imperial' ? (UnitConverter.lbsToKg(tankNum) ?? tankNum) : tankNum
      const totalLiters = kg * tankQuantity * KG_TO_LITERS
      const displayVolume = system === 'imperial'
        ? UnitConverter.litersToGallons(totalLiters)
        : totalLiters
      if (displayVolume !== null && displayVolume !== undefined) {
        setValue('propane_liters', parseFloat(displayVolume.toFixed(3)))
      }
    }
  }, [tankSizeDisplay, tankQuantity, system, setValue, isInitialMount])

  const onSubmit = async (data: PropaneRecordFormData) => {
    setError(null)

    try {
      // Construct notes with vendor prefix if vendor provided
      let finalNotes = data.notes || ''
      if (data.vendor && data.vendor.trim()) {
        finalNotes = `Vendor: ${data.vendor.trim()}\n${finalNotes}`.trim()
      }

      // We're using fuel_records table but ONLY propane_liters field
      const payload: FuelRecordCreate | FuelRecordUpdate = {
        vin,
        date: data.date,
        odometer_km: undefined,  // Never set for propane
        liters: undefined,  // Never set for propane
        propane_liters: toCanonicalLiters(data.propane_liters, system) ?? undefined,
        tank_size_kg: toCanonicalKg(data.tank_size_kg, system) ?? undefined,
        tank_quantity: data.tank_quantity,
        // Form's price field is per-volume math (cost = volume × price), so
        // store with basis='per_volume' and convert imperial $/gal entries
        // to canonical $/L. Earlier code saved basis='per_tank' with raw
        // values, which was inconsistent with the form's own math and the
        // rest of the app's metric-canonical storage convention.
        price_per_unit: priceToCanonical(data.price_per_unit, system, 'per_volume') ?? undefined,
        price_basis: 'per_volume',
        cost: data.cost,
        fuel_type: 'Propane',  // Always propane
        is_full_tank: false,  // Not relevant for propane
        missed_fillup: false,
        is_hauling: false,
        notes: finalNotes || undefined,
      }

      if (isEdit && record) {
        await updateMutation.mutateAsync({ id: record.id, ...payload })
      } else {
        await createMutation.mutateAsync(payload as FuelRecordCreate)
      }

      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common:error'))
    }
  }

  return (
    <FormModalWrapper
      title={isEdit ? t('propane.editTitle') : t('propane.createTitle')}
      onClose={onClose}
      width="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('common:cancel')}
          </Button>
          <Button type="submit" form="propane-record-form" variant="primary" icon={Save} loading={isSubmitting}>
            {isSubmitting ? t('common:saving') : isEdit ? t('common:update') : t('common:create')}
          </Button>
        </>
      }
    >
        <form id="propane-record-form" onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {error && (
            <div className="bg-danger/10 border border-danger rounded-lg p-3">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field id="date" label={t('common:date')} required error={errors.date}>
              <Input type="date" id="date" {...register('date')} invalid={!!errors.date} disabled={isSubmitting} />
            </Field>
          </div>

          {/* Tank Information Section */}
          <div className="border-t border-border pt-4 mt-4">
            <h3 className="text-sm font-medium text-text mb-3">{t('propane.tankInfo')}</h3>

            <div className="grid grid-cols-2 gap-4">
              <Field id="tank_size_kg" label={t('propane.tankSize')} unit={UnitFormatter.getWeightUnit(system)}>
                <Select
                  id="tank_size_kg"
                  {...register('tank_size_kg', { valueAsNumber: true })}
                  disabled={isSubmitting}
                  placeholder={t('propane.selectTankSize')}
                  options={TANK_SIZES.map((tank) => {
                    const value = system === 'imperial' ? Math.round(UnitConverter.kgToLbs(tank.kg) ?? 0) : tank.kg
                    const label = t('propaneRecordForm.tankSizeOption', {
                      size: system === 'imperial' ? tank.sizeImperial : tank.sizeMetric,
                      unit: UnitFormatter.getWeightUnit(system),
                      kind: t(tank.kind === 'rv' ? 'propaneRecordForm.tankKindRv' : 'propaneRecordForm.tankKindPortable'),
                    })
                    return { value: String(value), label }
                  })}
                />
              </Field>

              <Field id="tank_quantity" label={t('propane.numberOfTanks')} error={errors.tank_quantity}>
                <NumberInput id="tank_quantity" {...registerDecimal(register, 'tank_quantity')} invalid={!!errors.tank_quantity} disabled={isSubmitting} />
              </Field>
            </div>

            {tankSizeDisplay && tankQuantity && (() => {
              const tankNum = parseFloat(tankSizeDisplay.toString())
              const kg = system === 'imperial' ? (UnitConverter.lbsToKg(tankNum) ?? tankNum) : tankNum
              const totalLiters = kg * tankQuantity * KG_TO_LITERS
              const display = system === 'imperial' ? UnitConverter.litersToGallons(totalLiters) : totalLiters
              return (
                <p className="text-xs text-text-mute mt-2">
                  {t('propaneRecordForm.autoCalculatedVolume', { value: display?.toFixed(2) ?? '', unit: UnitFormatter.getVolumeUnit(system) })}
                </p>
              )
            })()}
          </div>

          <Field id="propane_liters" label={t('propaneRecordForm.propaneVolume')} unit={UnitFormatter.getVolumeUnit(system)} error={errors.propane_liters}>
            <NumberInput id="propane_liters" {...registerDecimal(register, 'propane_liters')} placeholder={system === 'imperial' ? '10.500' : '39.750'} invalid={!!errors.propane_liters} disabled={isSubmitting} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field id="price_per_unit" label={`${t('fuel.pricePer')} ${UnitFormatter.getVolumeUnit(system)}`} error={errors.price_per_unit}>
              <div className="relative">
                <CurrencyInputPrefix />
                <NumberInput id="price_per_unit" {...registerDecimal(register, 'price_per_unit')} placeholder={system === 'imperial' ? '2.899' : '0.766'} invalid={!!errors.price_per_unit} disabled={isSubmitting} className="pl-7" />
              </div>
            </Field>
            <Field id="cost" label={t('common:totalCost')} error={errors.cost} hint={t('fuel.autoCalculatedHint')}>
              <div className="relative">
                <CurrencyInputPrefix />
                <NumberInput id="cost" {...registerDecimal(register, 'cost')} placeholder="30.44" invalid={!!errors.cost} disabled={isSubmitting} className="pl-7" />
              </div>
            </Field>
          </div>

          <Field id="vendor" label={t('propane.vendorLocation')} error={errors.vendor}>
            <Input type="text" id="vendor" {...register('vendor')} placeholder={t('propaneRecordForm.vendorPlaceholder')} invalid={!!errors.vendor} disabled={isSubmitting} />
          </Field>

          <Field id="notes" label={t('common:notes')} error={errors.notes}>
            <Textarea id="notes" rows={3} {...register('notes')} placeholder={t('common:additionalNotes')} invalid={!!errors.notes} disabled={isSubmitting} />
          </Field>
        </form>
    </FormModalWrapper>
  )
}
