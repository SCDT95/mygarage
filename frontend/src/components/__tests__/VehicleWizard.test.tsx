import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../__tests__/test-utils'
import VehicleWizard from '../VehicleWizard'
import { FUEL_TYPE_VALUES, FUEL_TYPE_LABELS } from '../../constants/fuel'
import type { VINDecodeResponse } from '../../types/vin'

// VIN decode/validate/duplicate-check network calls — mocked so the wizard's
// VINInput child never hits the real API.
vi.mock('@/services/vinService', () => ({
  vinService: {
    validate: vi.fn().mockResolvedValue({ valid: true, vin: '1HGCM82633A004352' }),
    decode: vi.fn(),
    exists: vi.fn().mockResolvedValue(false),
  },
}))

// Not exercised by these tests (only hit on final submit), but the module is
// imported at the top of VehicleWizard.tsx.
vi.mock('../../services/vehicleService', () => ({
  default: {
    create: vi.fn(),
    uploadPhoto: vi.fn(),
    setMainPhoto: vi.fn(),
  },
}))

import { vinService } from '@/services/vinService'

const mockedVinService = vi.mocked(vinService)
const TEST_VIN = '1HGCM82633A004352'

function renderAndEnterVin(): void {
  render(<VehicleWizard onClose={vi.fn()} />)

  const vinInput = screen.getByPlaceholderText('vinInput.placeholder')
  fireEvent.change(vinInput, { target: { value: TEST_VIN } })
}

async function goToStep2(): Promise<void> {
  renderAndEnterVin()

  const nextButton = await screen.findByRole('button', { name: 'wizard.next' })
  await waitFor(() => expect(nextButton).not.toBeDisabled())
  fireEvent.click(nextButton)

  await screen.findByLabelText('wizard.fuelType')
}

async function decodeWithEngine(engine: VINDecodeResponse['engine']): Promise<void> {
  mockedVinService.decode.mockResolvedValue({
    vin: TEST_VIN,
    year: 2020,
    make: 'Ford',
    model: 'Escape',
    engine,
  })

  renderAndEnterVin()

  const decodeButton = await screen.findByRole('button', { name: 'vinInput.decode' })
  await waitFor(() => expect(decodeButton).not.toBeDisabled())
  fireEvent.click(decodeButton)

  await waitFor(() => expect(mockedVinService.decode).toHaveBeenCalledWith(TEST_VIN))

  const nextButton = await screen.findByRole('button', { name: 'wizard.next' })
  fireEvent.click(nextButton)

  await screen.findByLabelText('wizard.fuelType')
}

describe('VehicleWizard — canonical fuel-type select', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedVinService.validate.mockResolvedValue({ valid: true, vin: TEST_VIN })
    mockedVinService.exists.mockResolvedValue(false)
  })

  it('renders a select with the empty option plus all 10 canonical fuel types', async () => {
    await goToStep2()

    const select = screen.getByLabelText('wizard.fuelType') as HTMLSelectElement
    const options = Array.from(select.options)

    expect(options).toHaveLength(FUEL_TYPE_VALUES.length + 1)
    expect(options[0].value).toBe('')

    FUEL_TYPE_VALUES.forEach((value, index) => {
      const option = options[index + 1]
      expect(option.value).toBe(value)
      expect(option.textContent).toBe(FUEL_TYPE_LABELS[value])
    })
  })

  it('prefills fuel_type from the NHTSA-normalized value, not the raw string', async () => {
    await decodeWithEngine({
      displacement_l: '2.0',
      cylinders: 4,
      fuel_type: 'Gasoline/E85 (dual fuel)',
      fuel_type_normalized: 'e85',
    })

    const select = screen.getByLabelText('wizard.fuelType') as HTMLSelectElement
    expect(select.value).toBe('e85')
  })

  it('falls back to the empty selection when NHTSA normalization failed', async () => {
    await decodeWithEngine({
      displacement_l: '2.0',
      cylinders: 4,
      fuel_type: 'Not Applicable',
      fuel_type_normalized: null,
    })

    const select = screen.getByLabelText('wizard.fuelType') as HTMLSelectElement
    expect(select.value).toBe('')
  })
})
