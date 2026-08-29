import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save } from 'lucide-react'
import FormModalWrapper from './FormModalWrapper'
import type { FuelRecord, FuelRecordCreate, FuelRecordUpdate } from '../types/fuel'
import type { UnitSet } from '../types/units'
import { makePropaneRecordSchema, type PropaneRecordFormData } from '../schemas/propane'
import { useCreatePropaneRecord, useUpdatePropaneRecord } from '../hooks/queries/usePropaneRecords'
import { useUnitPreference } from '../hooks/useUnitPreference'
import { useUnitFormat } from '../hooks/useUnitFormat'
import { UnitConverter, UnitFormatter } from '../utils/units'
import { canonicalFromUnitField, seedUnitField, type UnitFieldOrigin } from '../utils/unitFormat'
import { toCanonicalLiters, priceToDisplay, priceToCanonical, readNumber } from '../utils/decimalSafe'
import { useOnUserEdit } from '../hooks/useOnUserEdit'
import { formatDateForInput } from '../utils/dateUtils'
import CurrencyInputPrefix from './common/CurrencyInputPrefix'
import { Button, Field, Input, NumberInput, Select, Textarea, registerDecimal } from './ui'
import { applyServerErrors } from '../hooks/useApiFormErrors'
import { getActionErrorMessage } from '../utils/httpErrorHandler'

// Propane density: 1 kg ≈ 1.968 L (1 gal ≈ 1.923 kg, 1 gal = 3.78541 L).
const KG_TO_LITERS = 1.968

// Tank sizes in kg (canonical). The nominal display size differs per MASS unit
// (a 9.07 kg tank is sold as "20 lb"), so it is carried here keyed by the token
// the client resolved, not chosen by a system collapsed from its volume: a
// `{volume: 'L', mass: 'lb'}` account was offered "9 kg" bottles. `Record` over
// the token means a mass unit added later cannot compile without its own
// nominal name. The unit suffix and the "portable"/"RV" qualifier are resolved
// at render time via the mass adapter and t() — never baked into a translation.
const TANK_SIZES: readonly {
  kg: number
  nominal: Record<UnitSet['mass'], number>
  kind: 'portable' | 'rv'
}[] = [
  { kg: 9.07,   nominal: { kg: 9,   lb: 20  }, kind: 'portable' },
  { kg: 14.97,  nominal: { kg: 15,  lb: 33  }, kind: 'portable' },
  { kg: 45.36,  nominal: { kg: 45,  lb: 100 }, kind: 'rv' },
  { kg: 190.51, nominal: { kg: 190, lb: 420 }, kind: 'rv' },
]

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
  // ★ `system` survives here for the volume and price EXAMPLE hints only,
  // which plan 3b ruling R4 gives to task 7 along with those two fields'
  // entry-grid shift. Everything mass reads `u.mass`; volume and price read the
  // resolved `units` (task 2).
  const { system, units } = useUnitPreference()
  const u = useUnitFormat()

  /**
   * The canonical origin of the tank size, seeded once.
   *
   * The size used to be read and written on `useUnitPreference().system`, which
   * spec D8 collapses from VOLUME, so a `{volume: 'L', mass: 'lb'}` account was
   * offered kilogramme bottles and stored its pick as kilogrammes.
   *
   * The origin matters more here than the units do. `seedUnitField` writes
   * `toFixed(precision)` and mass carries two decimals, so 9.07 kg seeds as
   * '20.00' while the `<select>` can only hand back '20'. Converting that
   * spelling stores 9.07184, which is why `canonicalFromUnitField` compares the
   * quantity rather than the characters.
   */
  const [tankSizeOrigin] = useState<UnitFieldOrigin>(() =>
    seedUnitField(readNumber(record?.tank_size_kg), u.mass)
  )

  /**
   * One tank's `<select>` value, in the client's mass unit.
   *
   * Normalised through `Number` because the control round-trips its value that
   * way: the option, the seeded default and the submitted value all have to be
   * the same spelling of the same quantity, and reading them all out of
   * `toInputValue` is what keeps them from drifting apart.
   */
  const tankOptionValue = (kg: number): string => String(Number(u.mass.toInputValue(kg)))

  // Extract vendor from notes if it was stored there
  const extractVendor = (notes?: string): string => {
    if (!notes) return ''
    const match = notes.match(/^Vendor: (.+?)(?:\n|$)/)
    return match ? match[1] : ''
  }

  // Zod bakes its messages in at construction, so the schema is rebuilt when
  // the language changes. Only the resolver depends on it — no fetch, no
  // reset() — so a rebuild can't discard what the user typed.
  const schema = useMemo(() => makePropaneRecordSchema(t), [t])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
    subscribe,
    setError: setFieldError,
  } = useForm<PropaneRecordFormData>({
    resolver: zodResolver(schema) as Resolver<PropaneRecordFormData>,
    defaultValues: {
      date: formatDateForInput(record?.date),
      propane_liters: (() => {
        if (record?.propane_liters == null) return undefined
        const liters = typeof record.propane_liters === 'string'
          ? parseFloat(record.propane_liters)
          : record.propane_liters
        if (isNaN(liters)) return undefined
        // Same resolved set the submit converts back with (defect L1).
        return UnitConverter.litersToVolumeUnit(liters, units) ?? undefined
      })(),
      // Read uses the record's stored basis so legacy records saved with
      // basis='per_tank' (pre-fix bug — the form labeled the field $/gal
      // or $/L but stored the user's typed value raw under per_tank) display
      // the same value the user typed. Records saved with the corrected
      // basis='per_volume' are converted from canonical $/L to $/gal for
      // imperial users.
      price_per_unit: priceToDisplay(record?.price_per_unit, units, record?.price_basis ?? 'per_volume') ?? undefined,
      cost: (() => {
        if (!record?.cost) return undefined
        const cost = typeof record.cost === 'string'
          ? parseFloat(record.cost)
          : record.cost
        return isNaN(cost) ? undefined : cost
      })(),
      vendor: extractVendor(record?.notes ?? undefined) || '',
      notes: record?.notes?.replace(/^Vendor: .+?(?:\n|$)/, '') || '',
      tank_size_kg: readNumber(tankSizeOrigin.display),
      tank_quantity: record?.tank_quantity ?? undefined,
    },
  })

  // Watched for the read-only auto-calculated volume hint under the tank row.
  const tankSizeDisplay = watch('tank_size_kg')
  const tankQuantity = watch('tank_quantity')

  // Volume from the tank row, then cost from the volume. Both run on user
  // edits only (see useOnUserEdit): a saved record's typed-over volume and
  // its receipt total must survive being reopened, and a partial refill of a
  // 33 lb bottle is exactly that. The chain still works on real input,
  // because the handler recomputes the cost from the volume it just wrote
  // rather than waiting to be re-entered through its own setValue.
  const displayVolumeForTank = (tankSize: number, quantity: number): number | null => {
    // tank_size_kg holds the user's displayed tank weight, in `units.mass`.
    const kg = u.mass.toCanonical(tankSize) ?? tankSize
    const totalLiters = kg * quantity * KG_TO_LITERS
    // The tank row writes straight into propane_liters, so it has to land in
    // the SAME unit that field is entered and submitted in.
    return UnitConverter.litersToVolumeUnit(totalLiters, units)
  }

  useOnUserEdit(
    subscribe,
    ['tank_size_kg', 'tank_quantity', 'propane_liters', 'price_per_unit'],
    (values, name) => {
      let volume = readNumber(values.propane_liters)

      if (name === 'tank_size_kg' || name === 'tank_quantity') {
        const tankSize = readNumber(values.tank_size_kg)
        const quantity = readNumber(values.tank_quantity)
        if (tankSize === undefined || quantity === undefined) return
        const display = displayVolumeForTank(tankSize, quantity)
        if (display === null) return
        volume = parseFloat(display.toFixed(3))
        setValue('propane_liters', volume)
      }

      const price = readNumber(values.price_per_unit)
      if (volume === undefined || price === undefined) return
      setValue('cost', parseFloat((volume * price).toFixed(2)))
    },
  )

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
        // ★ Volume and price convert through ONE resolved set (defect L1).
        propane_liters: toCanonicalLiters(data.propane_liters, units) ?? undefined,
        // Back through `units.mass`, and an untouched selection returns the
        // canonical value it was seeded from rather than a re-conversion.
        tank_size_kg:
          canonicalFromUnitField(
            String(readNumber(data.tank_size_kg) ?? ''),
            tankSizeOrigin,
            u.mass
          ) ?? undefined,
        tank_quantity: data.tank_quantity,
        // Form's price field is per-volume math (cost = volume × price), so
        // store with basis='per_volume' and convert imperial $/gal entries
        // to canonical $/L. Earlier code saved basis='per_tank' with raw
        // values, which was inconsistent with the form's own math and the
        // rest of the app's metric-canonical storage convention.
        price_per_unit: priceToCanonical(data.price_per_unit, units, 'per_volume') ?? undefined,
        price_basis: 'per_volume',
        cost: data.cost,
        fuel_type_used: 'propane_lpg',  // Always propane
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
      // attached.length === 0 catches a non-422 failure (network drop, 500):
      // it carries no field problems at all, so `unhandled` alone would stay
      // empty and this banner would never show.
      const { attached, unhandled } = applyServerErrors<PropaneRecordFormData>(setFieldError, err, [
        'date',
        'tank_size_kg',
        'tank_quantity',
        'propane_liters',
        'price_per_unit',
        'cost',
        'vendor',
        'notes',
      ])
      if (attached.length === 0 || unhandled.length > 0) {
        setError(getActionErrorMessage(err, t('propane.saveAction')))
      }
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
              <Field id="tank_size_kg" label={t('propane.tankSize')} unit={u.mass.label}>
                <Select
                  id="tank_size_kg"
                  {...register('tank_size_kg', { valueAsNumber: true })}
                  disabled={isSubmitting}
                  placeholder={t('propane.selectTankSize')}
                  options={TANK_SIZES.map((tank) => {
                    const label = t('propaneRecordForm.tankSizeOption', {
                      size: tank.nominal[units.mass],
                      unit: u.mass.label,
                      kind: t(tank.kind === 'rv' ? 'propaneRecordForm.tankKindRv' : 'propaneRecordForm.tankKindPortable'),
                    })
                    return { value: tankOptionValue(tank.kg), label }
                  })}
                />
              </Field>

              <Field id="tank_quantity" label={t('propane.numberOfTanks')} error={errors.tank_quantity}>
                <NumberInput id="tank_quantity" {...registerDecimal(register, 'tank_quantity')} invalid={!!errors.tank_quantity} disabled={isSubmitting} />
              </Field>
            </div>

            {tankSizeDisplay && tankQuantity && (() => {
              // Same maths the auto-calc writes into the volume field, so the
              // hint can never quote a different number than the field gets.
              const display = displayVolumeForTank(
                readNumber(tankSizeDisplay) ?? 0,
                readNumber(tankQuantity) ?? 0,
              )
              return (
                <p className="text-xs text-text-mute mt-2">
                  {t('propaneRecordForm.autoCalculatedVolume', { value: display?.toFixed(2) ?? '', unit: UnitFormatter.getVolumeUnit(units) })}
                </p>
              )
            })()}
          </div>

          <Field id="propane_liters" label={t('propaneRecordForm.propaneVolume')} unit={UnitFormatter.getVolumeUnit(units)} error={errors.propane_liters}>
            <NumberInput id="propane_liters" {...registerDecimal(register, 'propane_liters')} placeholder={system === 'imperial' ? '10.500' : '39.750'} invalid={!!errors.propane_liters} disabled={isSubmitting} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field id="price_per_unit" label={`${t('fuel.pricePer')} ${UnitFormatter.getVolumeUnit(units)}`} error={errors.price_per_unit}>
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
