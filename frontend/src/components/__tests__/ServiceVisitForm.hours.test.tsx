import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { render } from '../../__tests__/test-utils'
import ServiceVisitForm from '../ServiceVisitForm'
import type { ServiceVisit } from '../../types/serviceVisit'

// Task 14 — service-visit form engine-hours usage tracking. Mirrors
// FuelRecordForm.hours coverage (Task 13, commit c7a87c1): hours-tracking
// vehicle shows the engine-hours reading input and hides odometer,
// distance-tracking the reverse, dual shows both; submit carries
// engine_hours; edit prefills it.

const drawerForm = (): HTMLFormElement =>
  screen.getByRole('dialog').querySelector('form') as HTMLFormElement

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

// Requires AuthProvider otherwise — same mock pattern as ServiceVisitForm.test.tsx.
vi.mock('../../hooks/useUnitPreference', () => ({
  useUnitPreference: () => ({ system: 'metric', showBoth: false }),
}))
vi.mock('../../hooks/useCurrencyPreference', () => ({
  useCurrencyPreference: () => ({
    currencyCode: 'USD',
    locale: 'en-US',
    formatCurrency: () => '$0.00',
  }),
}))
// Empty supplies list — this suite doesn't exercise supplies_used, and an
// empty list keeps LineItemEditor's SupplyUsedPicker inert.
vi.mock('../../hooks/queries/useSupplies', () => ({
  useSupplies: () => ({
    data: { supplies: [], total: 0 },
    isSuccess: true,
    isLoading: false,
    isError: false,
  }),
}))
vi.mock('../VendorSearch', () => ({
  default: () => <div data-testid="vendor-search" />,
}))
vi.mock('../ServiceVisitAttachmentUpload', () => ({
  default: () => <div data-testid="attachment-upload" />,
}))
vi.mock('../ServiceVisitAttachmentList', () => ({
  default: () => <div data-testid="attachment-list" />,
}))
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const DEFAULT_PROPS = {
  vin: 'TEST12345678901234',
  onClose: vi.fn(),
  onSuccess: vi.fn(),
}

const odometerInput = () => document.getElementById('service-odometer') as HTMLInputElement | null
const engineHoursInput = () => document.getElementById('service-engine-hours') as HTMLInputElement | null

// LineItemEditor is the REAL component (not stubbed) so a create-mode submit
// test can satisfy the "every line item needs a description" gate the same
// way ServiceVisitForm.supplies.test.tsx does.
function fillRequiredDescription() {
  fireEvent.change(screen.getByPlaceholderText('lineItemEditor.misc.selectCategoryFirst'), {
    target: { value: 'Oil change' },
  })
}

describe('ServiceVisitForm — engine-hours usage tracking (Task 14)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApiPost.mockResolvedValue({ data: {} })
    mockedApiPut.mockResolvedValue({ data: {} })
  })

  it('shows the engine-hours input (and hides odometer) for an hours-tracking vehicle', async () => {
    mockedApiGet.mockResolvedValue({ data: { usage_unit: 'hours', secondary_usage_enabled: false } })
    render(<ServiceVisitForm {...DEFAULT_PROPS} />)
    await waitFor(() => expect(mockedApiGet).toHaveBeenCalled())
    await waitFor(() => expect(engineHoursInput()).toBeInTheDocument())

    expect(odometerInput()).not.toBeInTheDocument()
  })

  it('shows the odometer input (and hides engine-hours) for a distance-tracking vehicle', async () => {
    mockedApiGet.mockResolvedValue({ data: { usage_unit: 'distance', secondary_usage_enabled: false } })
    render(<ServiceVisitForm {...DEFAULT_PROPS} />)
    await waitFor(() => expect(mockedApiGet).toHaveBeenCalled())

    expect(odometerInput()).toBeInTheDocument()
    expect(engineHoursInput()).not.toBeInTheDocument()
  })

  it('shows BOTH odometer and engine-hours inputs for a dual-tracking vehicle', async () => {
    mockedApiGet.mockResolvedValue({ data: { usage_unit: 'distance', secondary_usage_enabled: true } })
    render(<ServiceVisitForm {...DEFAULT_PROPS} />)
    await waitFor(() => expect(mockedApiGet).toHaveBeenCalled())
    await waitFor(() => expect(engineHoursInput()).toBeInTheDocument())

    expect(odometerInput()).toBeInTheDocument()
  })

  it('defaults to the odometer input before the vehicle fetch resolves (no flash of the wrong field)', () => {
    mockedApiGet.mockReturnValue(new Promise(() => {})) // never resolves
    render(<ServiceVisitForm {...DEFAULT_PROPS} />)

    expect(odometerInput()).toBeInTheDocument()
    expect(engineHoursInput()).not.toBeInTheDocument()
  })

  it('submits engine_hours in the create payload', async () => {
    mockedApiGet.mockResolvedValue({ data: { usage_unit: 'hours', secondary_usage_enabled: false } })
    render(<ServiceVisitForm {...DEFAULT_PROPS} />)
    await waitFor(() => expect(mockedApiGet).toHaveBeenCalled())
    await waitFor(() => expect(engineHoursInput()).toBeInTheDocument())

    fillRequiredDescription()
    fireEvent.change(engineHoursInput()!, { target: { value: '812.4' } })
    fireEvent.submit(drawerForm())

    await waitFor(() => expect(mockedApiPost).toHaveBeenCalled())
    const body = mockedApiPost.mock.calls.at(-1)?.[1] as Record<string, unknown>
    expect(body.engine_hours).toBe(812.4)
  })

  it('prefills engine_hours from the visit on edit', async () => {
    mockedApiGet.mockResolvedValue({ data: { usage_unit: 'hours', secondary_usage_enabled: false } })
    const visit = {
      id: 900,
      vin: DEFAULT_PROPS.vin,
      date: '2026-07-01',
      created_at: '2026-07-01T00:00:00',
      calculated_total_cost: '0.00',
      has_failed_inspections: false,
      line_item_count: 1,
      subtotal: '0.00',
      vendor_id: null,
      odometer_km: null,
      engine_hours: '640.5',
      notes: null,
      insurance_claim_number: null,
      tax_amount: null,
      shop_supplies: null,
      misc_fees: null,
      service_category: null,
      total_cost: '0.00',
      updated_at: null,
      vendor: null,
      line_items: [
        {
          id: 501,
          visit_id: 900,
          description: 'Oil change',
          category: 'Maintenance',
          cost: null,
          created_at: '2026-07-01T00:00:00',
          is_failed_inspection: false,
          is_inspection: false,
          needs_followup: false,
          notes: null,
          triggered_by_inspection_id: null,
          supply_usages: [],
        },
      ],
    } as unknown as ServiceVisit

    render(<ServiceVisitForm {...DEFAULT_PROPS} visit={visit} />)
    await waitFor(() => expect(mockedApiGet).toHaveBeenCalled())
    await waitFor(() => expect(engineHoursInput()).toBeInTheDocument())

    expect(engineHoursInput()!.value).toBe('640.5')
  })
})
