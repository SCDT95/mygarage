/**
 * Task 3c: the fuel form's odometer and outside temperature, per quantity.
 *
 * Task 2 put this form's volume and price on the client's resolved `UnitSet`
 * and left the odometer and the outside temperature on the binary
 * `system === 'imperial'` path. `system` is D8-collapsed from VOLUME, so a
 * client resolving `{volume: 'L', distance: 'mi', temperature: 'f'}` read a
 * form whose volume and price honoured their units while the odometer beside
 * them was treated as kilometres and the temperature as Celsius. Those are
 * wrong numbers rather than merely inconsistent ones: the odometer's own round
 * trip stored a mileage reading verbatim into a kilometre column.
 *
 * Every case DRIVES the component and asserts RENDERED TEXT as well as the
 * posted body. A label naming the unit a value is not in is the same-screen
 * defect this slice exists to remove, and a payload assertion alone cannot see
 * it.
 *
 * Expected values are hand-written and derived in comments, never computed
 * through the code under test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { render } from '../../__tests__/test-utils'
import { IMPERIAL_UNITS, METRIC_UNITS } from '../../__tests__/factories'
import { binarySystemFor, type UnitSet } from '../../types/units'
import FuelRecordForm from '../FuelRecordForm'
import type { Vehicle } from '../../types/vehicle'

const mockedApiGet = vi.fn()
const mockedApiPost = vi.fn().mockResolvedValue({ data: {} })
const mockedApiPut = vi.fn().mockResolvedValue({ data: {} })

vi.mock('../../services/api', () => ({
  default: {
    get: (...args: unknown[]) => mockedApiGet(...args),
    post: (...args: unknown[]) => mockedApiPost(...args),
    put: (...args: unknown[]) => mockedApiPut(...args),
  },
}))

// `system` is DERIVED from `units`, exactly as the real hook derives it
// (`binarySystemFor(units.volume)`). A mock that pinned `system` to a literal
// could make every case below pass for the wrong reason: the whole defect is
// that `system` disagrees with `units.distance` and `units.temperature`, and a
// hardcoded `system` cannot express the disagreement. Commit `e3f834f` fixed
// exactly this in two other suites.
let units: UnitSet = METRIC_UNITS
vi.mock('../../hooks/useUnitPreference', () => ({
  useUnitPreference: () => ({
    system: binarySystemFor(units.volume),
    showBoth: false,
    units,
    gallonStandard: units.secondary_gallon,
  }),
}))

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('../../hooks/useTimeFormat', () => ({ useTimeFormat: () => ({ timeFormat: '24h' }) }))

// LOCAL i18n mock that RETAINS the interpolated unit. The global setup.ts mock
// is `t: (key) => key`, so a label assertion against it would render the same
// string whether the unit is right, wrong, or missing entirely.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { unit?: string }) =>
      options?.unit ? `${key} (${options.unit})` : key,
    i18n: { language: 'en', changeLanguage: () => Promise.resolve() },
  }),
  Trans: ({ children }: { children: ReactNode }) => children,
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const VIN = 'TEST12345678901234'
const DEFAULT_PROPS = { vin: VIN, onClose: vi.fn(), onSuccess: vi.fn() }

const vehicle = {
  vin: VIN,
  nickname: 'Test Car',
  vehicle_type: 'Car',
  year: 2024,
  make: 'Toyota',
  model: 'Camry',
  created_at: '2024-01-15T00:00:00Z',
  archived_visible: true,
  fuel_type: 'gasoline',
} as Vehicle

const field = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement

/** The rendered `<label>` text for a field, unit suffix included. */
const labelText = (id: string): string =>
  document.querySelector(`label[for="${id}"]`)?.textContent ?? ''

const drawerForm = (): HTMLFormElement =>
  screen.getByRole('dialog').querySelector('form') as HTMLFormElement

/** The body of the CREATE call, found by URL rather than by index. */
function postedPayload(): Record<string, unknown> {
  const call = mockedApiPost.mock.calls.find(
    (c) => typeof c[0] === 'string' && c[0].endsWith('/fuel')
  )
  expect(call, 'no create POST was made').toBeDefined()
  return call![1] as Record<string, unknown>
}

/**
 * A client whose VOLUME is metric but whose DISTANCE and TEMPERATURE are not.
 *
 * `binarySystemFor('L')` is `'metric'`, so every `system === 'imperial'` branch
 * answers "no" for two quantities this client chose in imperial units.
 */
const LITRES_MILES_FAHRENHEIT: UnitSet = {
  ...METRIC_UNITS,
  distance: 'mi',
  speed: 'mph',
  temperature: 'f',
}

/**
 * The mirror: gallons, but kilometres and Celsius.
 *
 * `binarySystemFor('gal_us')` is `'imperial'`, so the collapsed answer is wrong
 * in the OTHER direction here. Pinning both directions is what makes these
 * assertions statements about the distance and temperature tokens rather than
 * about the binary system under a different name.
 */
const GALLONS_KM_CELSIUS: UnitSet = {
  ...IMPERIAL_UNITS,
  distance: 'km',
  speed: 'kmh',
  temperature: 'c',
}

/** The receipt draft the backend hands back, or null to leave the panel off. */
const receipt = { draft: null as Record<string, unknown> | null }

beforeEach(() => {
  vi.clearAllMocks()
  mockedApiGet.mockImplementation((url: string) =>
    url.includes('/settings/public')
      ? Promise.resolve({
          data: {
            settings: [
              { key: 'llm_receipt_parse_enabled', value: receipt.draft ? 'true' : 'false' },
            ],
          },
        })
      : Promise.resolve({ data: vehicle })
  )
  mockedApiPost.mockImplementation((url: string) =>
    url.includes('parse-receipt')
      ? Promise.resolve({ data: { draft: receipt.draft, source: 'llm' } })
      : Promise.resolve({ data: {} })
  )
  mockedApiPut.mockResolvedValue({ data: {} })
  receipt.draft = null
  units = METRIC_UNITS
  // The outside-temp field lives inside the collapsed "More details" panel.
  localStorage.setItem('fuel_form:more_details_expanded', '1')
})

describe('FuelRecordForm — odometer and temperature follow their own tokens', () => {
  it('★ EDIT: volume, price, odometer and temperature all render in the units the client resolved', async () => {
    // The whole-form proof. One record, four quantities, four different
    // decisions, all read from the resolved set at once.
    //
    //   72420.3 km / 1.60934 = 45000 mi exactly (45000 x 1.60934 = 72420.3)
    //   20 C x 9/5 + 32      = 68.0 F
    //   47.318 L is already litres; $1.234/L is already per litre
    units = LITRES_MILES_FAHRENHEIT

    render(
      <FuelRecordForm
        {...DEFAULT_PROPS}
        record={{
          id: 7,
          vin: VIN,
          date: '2026-02-10',
          odometer_km: 72420.3,
          liters: 47.318,
          price_per_unit: 1.234,
          price_basis: 'per_volume',
          cost: 58.39,
          outside_temp_c: 20,
        } as never}
      />
    )
    await waitFor(() => expect(mockedApiGet).toHaveBeenCalled())

    // Rendered VALUES, per quantity.
    expect(field('odometer_km').value).toBe('45000')
    expect(field('outside_temp_display').value).toBe('68.0')
    expect(field('liters').value).toBe('47.318')
    expect(field('price_per_unit').value).toBe('1.234')

    // Rendered LABELS, per quantity. A right number under a wrong label is the
    // same-screen defect; both halves have to agree.
    expect(labelText('odometer_km')).toBe('common:mileage (mi)')
    expect(labelText('outside_temp_display')).toBe('fuel.outsideTemp (°F)')
    expect(labelText('liters')).toBe('fuel.volume (L)')
    expect(labelText('price_per_unit')).toBe('fuel.pricePer L')

    // And the binary answer really does disagree with two of them, so none of
    // the four above can be passing because the collapse happened to agree.
    expect(binarySystemFor(units.volume)).toBe('metric')
  })

  it('★ EDIT: saving that record untouched changes none of the four', async () => {
    // A seed in one unit and a submit in another rewrites a record the user
    // only opened. `seedUnitField` records the canonical origin so an untouched
    // field returns the stored value rather than a re-conversion of a rounded
    // display: 45000 mi converts back to 72420.3 km, but 72420.3 is what was
    // stored and 72420.3 is what must be posted.
    units = LITRES_MILES_FAHRENHEIT

    render(
      <FuelRecordForm
        {...DEFAULT_PROPS}
        record={{
          id: 7,
          vin: VIN,
          date: '2026-02-10',
          odometer_km: 72420.3,
          liters: 47.318,
          price_per_unit: 1.234,
          price_basis: 'per_volume',
          cost: 58.39,
          outside_temp_c: 20,
        } as never}
      />
    )
    await waitFor(() => expect(mockedApiGet).toHaveBeenCalled())
    await waitFor(() => expect(field('odometer_km').value).toBe('45000'))

    fireEvent.submit(drawerForm())
    await waitFor(() => expect(mockedApiPut).toHaveBeenCalled())

    const payload = mockedApiPut.mock.calls[0][1] as Record<string, unknown>
    expect(payload.odometer_km).toBe(72420.3)
    expect(payload.outside_temp_c).toBe(20)
    expect(payload.liters).toBe(47.318)
    expect(payload.price_per_unit).toBe(1.234)
  })

  it('★ EDIT: an odometer BETWEEN two whole miles survives a save that never touched it', async () => {
    // The case above round-trips exactly, so it cannot tell an origin from a
    // re-conversion. This one can, and it is what makes `seedUnitField`
    // load-bearing rather than decorative:
    //
    //   72420.5 km / 1.60934 = 45000.1242745 mi, shown as 45000 (mi has no
    //                          decimals)
    //   45000 mi x 1.60934   = 72420.3 km, which is NOT what was stored
    //
    // Re-converting the display would quietly move the reading 0.2 km every
    // time the record was opened and saved.
    units = LITRES_MILES_FAHRENHEIT

    render(
      <FuelRecordForm
        {...DEFAULT_PROPS}
        record={{ id: 11, vin: VIN, date: '2026-02-10', odometer_km: 72420.5 } as never}
      />
    )
    await waitFor(() => expect(mockedApiGet).toHaveBeenCalled())
    expect(field('odometer_km').value).toBe('45000')

    fireEvent.submit(drawerForm())
    await waitFor(() => expect(mockedApiPut).toHaveBeenCalled())
    const payload = mockedApiPut.mock.calls[0][1] as Record<string, unknown>
    expect(payload.odometer_km).toBe(72420.5)
    expect(payload.odometer_km).not.toBe(72420.3)
  })

  it('★ EDIT: retyping the temperature exactly as shown does not shift the stored Celsius', async () => {
    // The temperature's own lossy round trip, and the only path on which its
    // origin can be observed: an untouched field never reaches `onChange` at
    // all, so the drift shows up when a user types the reading, changes their
    // mind, and types it back.
    //
    //   21.7 C x 9/5 + 32   = 71.06 F, shown as 71.1 (F carries one decimal)
    //   (71.1 - 32) x 5/9   = 21.7222222222 C, which is NOT what was stored
    units = LITRES_MILES_FAHRENHEIT

    render(
      <FuelRecordForm
        {...DEFAULT_PROPS}
        record={{ id: 12, vin: VIN, date: '2026-02-10', outside_temp_c: 21.7 } as never}
      />
    )
    await waitFor(() => expect(mockedApiGet).toHaveBeenCalled())
    expect(field('outside_temp_display').value).toBe('71.1')

    fireEvent.change(field('outside_temp_display'), { target: { value: '70' } })
    fireEvent.change(field('outside_temp_display'), { target: { value: '71.1' } })
    fireEvent.submit(drawerForm())
    await waitFor(() => expect(mockedApiPut).toHaveBeenCalled())

    const payload = mockedApiPut.mock.calls[0][1] as Record<string, unknown>
    expect(payload.outside_temp_c).toBe(21.7)
    expect(payload.outside_temp_c).not.toBe(21.7222222222)
  })

  it('CREATE: a typed mileage and a typed Fahrenheit temperature reach the API canonical', async () => {
    //   45000 mi x 1.60934 = 72420.3 km
    //   (68 - 32) x 5/9    = 20 C
    //   47.318 L and $1.234/L pass through: the client's volume IS the canonical
    units = LITRES_MILES_FAHRENHEIT

    render(<FuelRecordForm {...DEFAULT_PROPS} />)
    await waitFor(() => expect(mockedApiGet).toHaveBeenCalled())

    fireEvent.change(field('date'), { target: { value: '2026-02-10' } })
    fireEvent.change(field('odometer_km'), { target: { value: '45000' } })
    fireEvent.change(field('price_basis'), { target: { value: 'per_volume' } })
    fireEvent.change(field('liters'), { target: { value: '47.318' } })
    fireEvent.change(field('price_per_unit'), { target: { value: '1.234' } })
    fireEvent.change(field('outside_temp_display'), { target: { value: '68' } })
    fireEvent.submit(drawerForm())

    await waitFor(() => expect(mockedApiPost).toHaveBeenCalled())
    const payload = postedPayload()
    expect(payload.odometer_km).toBe(72420.3)
    expect(payload.outside_temp_c).toBe(20)
    expect(payload.liters).toBe(47.318)
    expect(payload.price_per_unit).toBe(1.234)
  })

  it('the MIRROR client, gallons with kilometres and Celsius, reads and writes the other way', async () => {
    // Same form, `system === 'imperial'`, and both quantities must ignore it.
    // Without this case every assertion above could be satisfied by code that
    // simply inverted the binary branch.
    units = GALLONS_KM_CELSIUS

    render(
      <FuelRecordForm
        {...DEFAULT_PROPS}
        record={{
          id: 8,
          vin: VIN,
          date: '2026-02-10',
          odometer_km: 72420,
          outside_temp_c: 20,
        } as never}
      />
    )
    await waitFor(() => expect(mockedApiGet).toHaveBeenCalled())

    expect(field('odometer_km').value).toBe('72420')
    expect(field('outside_temp_display').value).toBe('20.0')
    expect(labelText('odometer_km')).toBe('common:mileage (km)')
    expect(labelText('outside_temp_display')).toBe('fuel.outsideTemp (°C)')
    expect(binarySystemFor(units.volume)).toBe('imperial')

    // Retyping the SAME displayed temperature is not an edit of the quantity,
    // so it must not re-convert into a different stored number.
    fireEvent.change(field('outside_temp_display'), { target: { value: '20.0' } })
    fireEvent.submit(drawerForm())
    await waitFor(() => expect(mockedApiPut).toHaveBeenCalled())

    const payload = mockedApiPut.mock.calls[0][1] as Record<string, unknown>
    expect(payload.odometer_km).toBe(72420)
    expect(payload.outside_temp_c).toBe(20)
  })

  it('the odometer placeholder is a mileage hint for a mileage field', async () => {
    // The placeholder was keyed on `system`, i.e. on VOLUME, so a litres-and-
    // miles client was shown a six-figure kilometre hint under a `mi` label.
    units = LITRES_MILES_FAHRENHEIT
    render(<FuelRecordForm {...DEFAULT_PROPS} />)
    await waitFor(() => expect(mockedApiGet).toHaveBeenCalled())
    expect(field('odometer_km').placeholder).toBe('45000')

    // And the volume placeholder on the same screen still follows VOLUME, which
    // for this client is litres. One form, two independent answers.
    expect(field('liters').placeholder).toBe('47.318')
  })

  it('★ the RECEIPT path lands the odometer in the client\'s distance unit', async () => {
    // `acceptReceiptDraft` seeds through its OWN calls rather than the form's
    // shared seed. That is the path the ledger says to look at first: both of
    // Task 2's only surviving mutants sat in exactly this function.
    //
    // The draft is canonical by contract (`receipt_parse_service.py:127` tells
    // the model to "Prefer metric: liters, odometer_km, price per liter").
    units = LITRES_MILES_FAHRENHEIT
    receipt.draft = { odometer_km: 72420.3, liters: 47.318 }

    render(<FuelRecordForm {...DEFAULT_PROPS} />)
    await waitFor(() => expect(field('receipt_text')).not.toBeNull())

    fireEvent.change(field('receipt_text'), { target: { value: '45000 mi' } })
    fireEvent.click(screen.getByRole('button', { name: 'fuel.parseReceipt' }))
    const accept = await screen.findByRole('button', { name: 'fuel.receiptDraftAccept' })
    fireEvent.click(accept)

    // 72420.3 km is 45000 mi. Seeding it raw would have put a kilometre reading
    // into a field labelled `mi`, and the submit would then have converted it
    // AGAIN into 116,564 km.
    await waitFor(() => expect(field('odometer_km').value).toBe('45000'))

    fireEvent.change(field('date'), { target: { value: '2026-02-10' } })
    fireEvent.submit(drawerForm())
    await waitFor(() => expect(mockedApiPost).toHaveBeenCalled())
    expect(postedPayload().odometer_km).toBe(72420.3)
  })

  it('a blank odometer and a cleared temperature post nothing rather than zero', async () => {
    // The null branches of both boundaries. A blank unit-bearing field that
    // posts 0 poisons a derived km delta, which is the shape of Task 1's F2a.
    units = LITRES_MILES_FAHRENHEIT

    render(
      <FuelRecordForm
        {...DEFAULT_PROPS}
        record={{
          id: 9,
          vin: VIN,
          date: '2026-02-10',
          odometer_km: 72420.3,
          outside_temp_c: 20,
        } as never}
      />
    )
    await waitFor(() => expect(field('odometer_km').value).toBe('45000'))

    fireEvent.change(field('odometer_km'), { target: { value: '' } })
    fireEvent.change(field('outside_temp_display'), { target: { value: '' } })
    fireEvent.submit(drawerForm())
    await waitFor(() => expect(mockedApiPut).toHaveBeenCalled())

    const payload = mockedApiPut.mock.calls[0][1] as Record<string, unknown>
    expect(payload.odometer_km).toBeUndefined()
    expect(payload.outside_temp_c).toBeUndefined()
  })
})
