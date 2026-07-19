import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EventNotificationsCard } from '../EventNotificationsCard'

describe('EventNotificationsCard — DEF-low event (Task 17)', () => {
  const noop = () => {}

  it('shows the DEF group collapsed by default with an accurate enabled count', () => {
    render(
      <EventNotificationsCard
        settings={{ notify_def_low: 'true' }}
        onSettingChange={noop}
        onTextChange={noop}
        saving={false}
        hasEnabledService
      />,
    )

    expect(screen.getByText('events.defLow.group')).toBeInTheDocument()
    // Every group renders a count. The exact numbers are not assertable here:
    // the shared test mock is `t: (key) => key`, so interpolation args are
    // dropped and all groups render the same key.
    expect(screen.getAllByText('events.card.enabledCount').length).toBeGreaterThan(0)
    // Collapsed: the toggle/percent field aren't in the DOM yet.
    expect(screen.queryByText('events.defLow.label')).not.toBeInTheDocument()
  })

  it('renders the DEF toggle and percent field (default 25) once the group is expanded', () => {
    render(
      <EventNotificationsCard
        settings={{}}
        onSettingChange={noop}
        onTextChange={noop}
        saving={false}
        hasEnabledService
      />,
    )

    fireEvent.click(screen.getByText('events.defLow.group'))

    expect(screen.getByText('events.defLow.label')).toBeInTheDocument()
    expect(screen.getByText('events.defLow.description')).toBeInTheDocument()

    const checkbox = screen.getByRole('checkbox', { name: 'events.defLow.label' })
    expect(checkbox).not.toBeChecked()

    const percentInput = screen.getByDisplayValue('25')
    expect(percentInput).toHaveAttribute('type', 'number')
    expect(percentInput).toHaveAttribute('min', '1')
    expect(percentInput).toHaveAttribute('max', '99')
    // No setting yet -> toggle off -> percent field disabled.
    expect(percentInput).toBeDisabled()
  })

  it('reflects a saved percent value and enables the field once the toggle is on', () => {
    render(
      <EventNotificationsCard
        settings={{ notify_def_low: 'true', notify_def_low_threshold_percent: '10' }}
        onSettingChange={noop}
        onTextChange={noop}
        saving={false}
        hasEnabledService
      />,
    )

    fireEvent.click(screen.getByText('events.defLow.group'))

    const checkbox = screen.getByRole('checkbox', { name: 'events.defLow.label' })
    expect(checkbox).toBeChecked()

    const percentInput = screen.getByDisplayValue('10')
    expect(percentInput).toBeEnabled()
  })

  it('toggling the checkbox calls onSettingChange with the notify_def_low key', () => {
    const onSettingChange = vi.fn()
    render(
      <EventNotificationsCard
        settings={{ notify_def_low: 'false' }}
        onSettingChange={onSettingChange}
        onTextChange={noop}
        saving={false}
        hasEnabledService
      />,
    )

    fireEvent.click(screen.getByText('events.defLow.group'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'events.defLow.label' }))

    expect(onSettingChange).toHaveBeenCalledWith('notify_def_low', true)
  })

  it('changing the percent field calls onTextChange with the threshold key', () => {
    const onTextChange = vi.fn()
    render(
      <EventNotificationsCard
        settings={{ notify_def_low: 'true', notify_def_low_threshold_percent: '25' }}
        onSettingChange={noop}
        onTextChange={onTextChange}
        saving={false}
        hasEnabledService
      />,
    )

    fireEvent.click(screen.getByText('events.defLow.group'))
    fireEvent.change(screen.getByDisplayValue('25'), { target: { value: '15' } })

    expect(onTextChange).toHaveBeenCalledWith('notify_def_low_threshold_percent', '15')
  })
})
