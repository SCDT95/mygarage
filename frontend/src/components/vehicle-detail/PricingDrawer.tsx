import { useEffect, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { DollarSign } from 'lucide-react'
import { toast } from 'sonner'
import FormModalWrapper from '../FormModalWrapper'
import { Button, Field, Input } from '../ui'
import vehicleService from '../../services/vehicleService'
import type { Vehicle, VehicleUpdate } from '../../types/vehicle'

interface PricingDrawerProps {
  open: boolean
  onClose: () => void
  vehicle: Vehicle
  vin: string
  /** Receives the server's updated vehicle after a successful save. */
  onUpdated: (vehicle: Vehicle) => void
}

/** All eight pricing fields, held as strings while editing (empty = unset). */
type PricingForm = {
  purchase_date: string
  purchase_price: string
  sold_date: string
  sold_price: string
  msrp_base: string
  msrp_options: string
  destination_charge: string
  msrp_total: string
}

const EMPTY_FORM: PricingForm = {
  purchase_date: '',
  purchase_price: '',
  sold_date: '',
  sold_price: '',
  msrp_base: '',
  msrp_options: '',
  destination_charge: '',
  msrp_total: '',
}

const str = (value: unknown): string => (value == null ? '' : String(value))
/** `<input type="date">` wants YYYY-MM-DD; tolerate a full ISO timestamp. */
const dateStr = (value: unknown): string => (value == null ? '' : String(value).slice(0, 10))
const emptyToNull = (value: string): string | null => (value.trim() === '' ? null : value.trim())

function seedForm(v: Vehicle): PricingForm {
  return {
    purchase_date: dateStr(v.purchase_date),
    purchase_price: str(v.purchase_price),
    sold_date: dateStr(v.sold_date),
    sold_price: str(v.sold_price),
    msrp_base: str(v.msrp_base),
    msrp_options: str(v.msrp_options),
    destination_charge: str(v.destination_charge),
    msrp_total: str(v.msrp_total),
  }
}

/**
 * Edit-pricing sidecar: purchase, sale, and MSRP in one form. Opened from the
 * combined Pricing card's Edit button. Unlike the equipment drawer's per-change
 * auto-save, this is a multi-field form — edits are local until Save commits
 * them in one partial PUT, then the drawer closes.
 */
export default function PricingDrawer({ open, onClose, vehicle, vin, onUpdated }: PricingDrawerProps) {
  const { t } = useTranslation('vehicles')
  const [form, setForm] = useState<PricingForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Reseed from the vehicle each time the drawer opens. Save closes it, so
    // there is no open-state reseed race (unlike the auto-saving equipment drawer).
    if (open) setForm(seedForm(vehicle))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set =
    (key: keyof PricingForm) =>
    (e: ChangeEvent<HTMLInputElement>): void =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      const payload: VehicleUpdate = {
        purchase_date: emptyToNull(form.purchase_date),
        purchase_price: emptyToNull(form.purchase_price),
        sold_date: emptyToNull(form.sold_date),
        sold_price: emptyToNull(form.sold_price),
        msrp_base: emptyToNull(form.msrp_base),
        msrp_options: emptyToNull(form.msrp_options),
        destination_charge: emptyToNull(form.destination_charge),
        msrp_total: emptyToNull(form.msrp_total),
      }
      const updated = await vehicleService.update(vin, payload)
      onUpdated(updated)
      onClose()
    } catch {
      toast.error(t('detail.pricing.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormModalWrapper
      isOpen={open}
      onClose={onClose}
      title={t('detail.pricing.editTitle')}
      icon={DollarSign}
      width="md"
      footer={
        <Button variant="primary" onClick={handleSave} loading={saving}>
          {t('common:save')}
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="pricing_purchase_date" label={t('edit.purchaseDate')}>
            <Input id="pricing_purchase_date" type="date" value={form.purchase_date} onChange={set('purchase_date')} />
          </Field>
          <Field id="pricing_purchase_price" label={t('edit.purchasePrice')}>
            <Input id="pricing_purchase_price" type="number" step="0.01" min="0" mono value={form.purchase_price} onChange={set('purchase_price')} />
          </Field>
          <Field id="pricing_sold_date" label={t('detail.misc.saleDate')}>
            <Input id="pricing_sold_date" type="date" value={form.sold_date} onChange={set('sold_date')} />
          </Field>
          <Field id="pricing_sold_price" label={t('detail.misc.salePrice')}>
            <Input id="pricing_sold_price" type="number" step="0.01" min="0" mono value={form.sold_price} onChange={set('sold_price')} />
          </Field>
        </div>

        <section className="space-y-4 border-t border-border pt-5">
          <div>
            <p className="text-sm font-semibold text-text">{t('detail.msrpPricing')}</p>
            <p className="text-xs text-text-mute">{t('detail.pricing.msrpHint')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="pricing_msrp_base" label={t('detail.misc.basePrice')}>
              <Input id="pricing_msrp_base" type="number" step="0.01" min="0" mono value={form.msrp_base} onChange={set('msrp_base')} />
            </Field>
            <Field id="pricing_msrp_options" label={t('detail.misc.options')}>
              <Input id="pricing_msrp_options" type="number" step="0.01" min="0" mono value={form.msrp_options} onChange={set('msrp_options')} />
            </Field>
            <Field id="pricing_destination_charge" label={t('detail.misc.destination')}>
              <Input id="pricing_destination_charge" type="number" step="0.01" min="0" mono value={form.destination_charge} onChange={set('destination_charge')} />
            </Field>
            <Field id="pricing_msrp_total" label={t('detail.misc.totalMsrp')}>
              <Input id="pricing_msrp_total" type="number" step="0.01" min="0" mono value={form.msrp_total} onChange={set('msrp_total')} />
            </Field>
          </div>
        </section>
      </div>
    </FormModalWrapper>
  )
}
