import type { ComponentProps } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '../../../__tests__/test-utils'
import VehicleActionsToolbar from '../VehicleActionsToolbar'

function setup(overrides: Partial<ComponentProps<typeof VehicleActionsToolbar>> = {}) {
  const props: ComponentProps<typeof VehicleActionsToolbar> = {
    isAdmin: true, importing: false, exporting: false, isOnline: true,
    showFuelAction: true, hasStandardEquipment: true, hasOptionalEquipment: true,
    onLogService: vi.fn(), onAddFuel: vi.fn(), onReminder: vi.fn(),
    onEditEquipment: vi.fn(), onEdit: vi.fn(), onAnalytics: vi.fn(),
    onImport: vi.fn(), onExport: vi.fn(), onOpenModal: vi.fn(), onOpenMobileMenu: vi.fn(),
    ...overrides,
  }
  render(<VehicleActionsToolbar {...props} />)
  return props
}

describe('VehicleActionsToolbar', () => {
  it('renders every required title attribute (G6/B8)', () => {
    setup()
    for (const title of [
      'detail.misc.importTooltip', 'detail.exportTooltip', 'detail.analyticsTooltip',
      'detail.shareTooltip', 'detail.editVehicle', 'detail.misc.transferTooltip',
      'detail.removeVehicle',
    ]) {
      expect(screen.getByTitle(title)).toBeInTheDocument()
    }
  })

  it('fires the tab-switch and equipment callbacks on click (SDQ-1/2)', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: 'detail.hero.logService' }))
    fireEvent.click(screen.getByRole('button', { name: 'detail.hero.addFuel' }))
    fireEvent.click(screen.getByRole('button', { name: 'detail.hero.reminder' }))
    fireEvent.click(screen.getByRole('button', { name: 'detail.hero.standard' }))
    fireEvent.click(screen.getByRole('button', { name: 'detail.hero.optional' }))
    expect(props.onLogService).toHaveBeenCalledTimes(1)
    expect(props.onAddFuel).toHaveBeenCalledTimes(1)
    expect(props.onReminder).toHaveBeenCalledTimes(1)
    expect(props.onEditEquipment).toHaveBeenCalledWith('standard')
    expect(props.onEditEquipment).toHaveBeenCalledWith('optional')
  })

  it('hides Add Fuel when showFuelAction is false', () => {
    setup({ showFuelAction: false })
    expect(screen.queryByRole('button', { name: 'detail.hero.addFuel' })).not.toBeInTheDocument()
  })

  it('hides the whole Equipment group when neither list exists (B7)', () => {
    setup({ hasStandardEquipment: false, hasOptionalEquipment: false })
    expect(screen.queryByText('detail.hero.equipment')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'detail.hero.standard' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'detail.hero.optional' })).not.toBeInTheDocument()
  })

  it('shows only Standard when only standard equipment exists (B7)', () => {
    setup({ hasStandardEquipment: true, hasOptionalEquipment: false })
    expect(screen.getByRole('button', { name: 'detail.hero.standard' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'detail.hero.optional' })).not.toBeInTheDocument()
  })
})
