import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../../__tests__/test-utils'

const mockGetEligible = vi.fn()
vi.mock('@/services/familyService', () => ({
  familyService: {
    getEligibleRecipients: (...a: unknown[]) => mockGetEligible(...a),
    transferVehicle: vi.fn(),
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import VehicleTransferWizard from '../VehicleTransferWizard'

const RECIPIENT = { id: 2, username: 'bob', full_name: 'Bob Jones', relationship: null }

function renderWizard(onClose = vi.fn()) {
  render(
    <VehicleTransferWizard
      isOpen
      onClose={onClose}
      vin="1HGBH41JXMN109186"
      vehicleNickname="Test Rig"
      onTransferComplete={vi.fn()}
    />,
  )
  return onClose
}

describe('VehicleTransferWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetEligible.mockResolvedValue([RECIPIENT])
  })

  it('composes the real Drawer primitive (testid + aria-modal + subtitle)', async () => {
    renderWizard()
    // The real Drawer primitive — not a hand-rolled overlay with role=dialog.
    const drawer = screen.getByTestId('drawer')
    expect(drawer).toBeInTheDocument()
    expect(drawer).toHaveAttribute('aria-modal', 'true')
    expect(drawer).toHaveAttribute('role', 'dialog')
    // Step-progress subtitle (key under the i18n mock) + recipients loaded.
    expect(screen.getByText('modal.transfer.stepProgress')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Bob Jones')).toBeInTheDocument())
  })

  it('advances to step 2 via the footer Next after selecting a recipient', async () => {
    renderWizard()
    fireEvent.click(await screen.findByText('Bob Jones')) // canProceed() -> true
    const next = screen.getByRole('button', { name: 'common:next' })
    // The control lives in the Drawer's <footer> slot (footer lift), not the body.
    expect(next.closest('footer')).not.toBeNull()
    await waitFor(() => expect(next).not.toBeDisabled())
    fireEvent.click(next)
    // Step-2 label proves the footer click advanced the wizard.
    expect(await screen.findByText('modal.includeAllData')).toBeInTheDocument()
  })

  it('closes on Escape and on backdrop click (Drawer behavior)', async () => {
    const onClose = renderWizard()
    await screen.findByText('Bob Jones')
    // Escape (Drawer's document keydown handler).
    fireEvent.keyDown(screen.getByTestId('drawer'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    // Backdrop click.
    fireEvent.click(screen.getByTestId('drawer-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
