/**
 * TireList under a metric resolved set, and under a custom one.
 *
 * The imperial file next to this one cannot tell "the adapter resolved in32"
 * from "the component hardcodes thirty-seconds": every assertion there is
 * consistent with a component that simply always converts. These cases pin the
 * other side, including the per-quantity custom user the binary `system` cannot
 * describe (metric volume, imperial tread), where `useUnitPreference().system`
 * answers 'metric' and the tread field must still be in thirty-seconds.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { UnitSet } from '@/types/units'

const useTiresMock = vi.fn()
const useUpsertTireMock = vi.fn()
const useAddTireReadingMock = vi.fn()
const useDeleteTireMock = vi.fn()

vi.mock('../../hooks/queries/useTires', () => ({
  useTires: () => useTiresMock(),
  useUpsertTire: () => useUpsertTireMock(),
  useAddTireReading: () => useAddTireReadingMock(),
  useDeleteTire: () => useDeleteTireMock(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

/** The metric preset, written out rather than imported, per this repo's rule. */
const METRIC: UnitSet = {
  distance: 'km',
  speed: 'kmh',
  length: 'm',
  volume: 'L',
  consumption: 'l_100km',
  pressure: 'kpa',
  temperature: 'c',
  mass: 'kg',
  torque: 'nm',
  tread: 'mm',
  secondary_gallon: 'us',
}

const h = vi.hoisted(() => ({ units: null as unknown }))

vi.mock('../../hooks/useUnitPreference', () => ({
  useUnitPreference: () => ({
    // `system` stays 'metric' in every case below, including the custom one:
    // spec D8 derives it from VOLUME, which is litres throughout. A component
    // reading `system` instead of the resolved set cannot tell these apart.
    system: 'metric',
    showBoth: false,
    gallonStandard: 'us',
    units: h.units,
  }),
}))

import TireList from '../TireList'

const STORED_FL_TIRE = {
  id: 1,
  vin: '1HGCM82633A004352',
  position: 'FL' as const,
  brand: 'Michelin',
  model_name: 'Pilot Sport 4',
  size: '225/45R17',
  dot_code: '2324',
  tread_depth_mm: '7.50',
  pressure_kpa: '240.00',
  min_tread_mm: '3.00',
  notes: null,
  below_threshold: false,
  projected_km_remaining: null,
  projected_wear_date: null,
  readings: [],
}

describe('TireList under a metric set', () => {
  beforeEach(() => {
    h.units = METRIC
    useUpsertTireMock.mockReturnValue({ mutate: vi.fn(), isPending: false })
    useAddTireReadingMock.mockReturnValue({ mutate: vi.fn(), isPending: false })
    useDeleteTireMock.mockReturnValue({ mutate: vi.fn(), isPending: false })
    useTiresMock.mockReturnValue({
      data: { tires: [STORED_FL_TIRE], total: 1 },
      isLoading: false,
      error: null,
    })
  })

  it('reads the card tread in the unit the resolved set names', () => {
    // Rendered twice against the SAME stored 7.50 mm, because "still shows mm"
    // is true of a component that never converts at all. Only the second half
    // can tell the adapter is being consulted.
    const { unmount } = render(<TireList vin="1HGCM82633A004352" />)
    expect(screen.getByText('7.50 mm')).toBeInTheDocument()
    unmount()

    h.units = { ...METRIC, tread: 'in32' }
    render(<TireList vin="1HGCM82633A004352" />)

    expect(screen.getByText('9/32 in')).toBeInTheDocument()
    expect(screen.queryByText('7.50 mm')).not.toBeInTheDocument()
  })

  it('reads the card pressure in the same unit the form accepts', () => {
    render(<TireList vin="1HGCM82633A004352" />)

    // `UnitFormatter.formatPressure` renders BAR for a metric user while this
    // component's own form has always accepted kPa, a disagreement its code
    // comment used to document. D2 requires one unit for entry and display.
    expect(screen.getByText('240 kPa')).toBeInTheDocument()
    expect(screen.queryByText('2.40 bar')).not.toBeInTheDocument()
  })

  it('shows canonical millimetres unconverted in the form, stepping by hundredths', () => {
    render(<TireList vin="1HGCM82633A004352" />)
    fireEvent.click(screen.getByLabelText('tireList.edit'))

    const tread = screen.getByLabelText('tireList.treadWithUnit') as HTMLInputElement
    expect(tread.value).toBe('7.50')
    expect(tread.step).toBe('0.01')
  })

  it('stores kPa unconverted, where the imperial path multiplies by 6.89476', () => {
    const mutate = vi.fn()
    useUpsertTireMock.mockReturnValue({ mutate, isPending: false })

    render(<TireList vin="1HGCM82633A004352" />)
    fireEvent.click(screen.getByLabelText('tireList.edit'))

    const pressure = screen.getByLabelText('tireList.pressureWithUnit') as HTMLInputElement
    expect(pressure.value).toBe('240')

    fireEvent.change(pressure, { target: { value: '250' } })
    fireEvent.click(screen.getByText('common:save'))

    expect(mutate.mock.calls[0][0].pressure_kpa).toBe(250)
  })

  it('stores the typed millimetres when the tread field is edited', () => {
    const mutate = vi.fn()
    useUpsertTireMock.mockReturnValue({ mutate, isPending: false })

    render(<TireList vin="1HGCM82633A004352" />)
    fireEvent.click(screen.getByLabelText('tireList.edit'))
    fireEvent.change(screen.getByLabelText('tireList.treadWithUnit'), {
      target: { value: '8' },
    })
    fireEvent.click(screen.getByText('common:save'))

    expect(mutate.mock.calls[0][0].tread_depth_mm).toBe(8)
  })

  it('offers the canonical 2.0 mm default unconverted on an untouched Add form', () => {
    const mutate = vi.fn()
    useUpsertTireMock.mockReturnValue({ mutate, isPending: false })

    render(<TireList vin="1HGCM82633A004352" />)
    fireEvent.click(screen.getByText('tireList.add'))

    // The same default an imperial user sees as 3 thirty-seconds.
    expect((screen.getByLabelText('tireList.minTreadWithUnit') as HTMLInputElement).value).toBe(
      '2.00'
    )

    fireEvent.click(screen.getByText('common:save'))

    expect(mutate.mock.calls[0][0].min_tread_mm).toBe(2)
  })

  it('follows a custom tread override even though the binary system is metric', () => {
    // ★ The case `system` cannot express: litres, kPa, and thirty-seconds.
    h.units = { ...METRIC, tread: 'in32' }
    const mutate = vi.fn()
    useUpsertTireMock.mockReturnValue({ mutate, isPending: false })

    render(<TireList vin="1HGCM82633A004352" />)
    expect(screen.getByText('9/32 in')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('tireList.edit'))
    // Pressure stays metric while tread is imperial: two quantities, two units.
    expect((screen.getByLabelText('tireList.pressureWithUnit') as HTMLInputElement).value).toBe(
      '240'
    )
    fireEvent.change(screen.getByLabelText('tireList.treadWithUnit'), {
      target: { value: '10' },
    })
    fireEvent.click(screen.getByText('common:save'))

    // 10/32 in x 0.79375 = 7.9375 mm
    expect(mutate.mock.calls[0][0].tread_depth_mm).toBe(7.9375)
  })
})
