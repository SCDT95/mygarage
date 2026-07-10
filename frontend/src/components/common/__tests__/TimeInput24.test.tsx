import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '../../../__tests__/test-utils'
import TimeInput24, { normalizeTime } from '../TimeInput24'

describe('normalizeTime', () => {
  it.each([
    ['22:00', '22:00'],
    ['2200', '22:00'],
    ['6:30', '06:30'],
    ['630', '06:30'],
    ['9', '09:00'],
    ['00:00', '00:00'],
    ['23:59', '23:59'],
    ['25:00', ''],
    ['12:60', ''],
    ['abc', ''],
    ['', ''],
    ['   ', ''],
  ])('normalizes %j -> %j', (input, expected) => {
    expect(normalizeTime(input)).toBe(expected)
  })
})

describe('TimeInput24', () => {
  it('renders the provided value', () => {
    render(<TimeInput24 id="t" ariaLabel="Fill-up time" value="22:00" onChange={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue('22:00')
  })

  it('fires onChange with raw text on every keystroke (parent stays current without blur)', () => {
    const onChange = vi.fn()
    render(<TimeInput24 id="t" ariaLabel="Fill-up time" value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '2200' } })
    expect(onChange).toHaveBeenLastCalledWith('2200') // raw, not yet normalized
  })

  it('normalizes to 24h "HH:MM" on blur (no meridiem shift)', () => {
    const onChange = vi.fn()
    render(<TimeInput24 id="t" ariaLabel="Fill-up time" value="" onChange={onChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '2200' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith('22:00')
  })

  it('KEEPS an invalid non-empty value on blur (so submit can block, not silently clear)', () => {
    const onChange = vi.fn()
    render(<TimeInput24 id="t" ariaLabel="Fill-up time" value="" onChange={onChange} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '25:00' } }) // per-keystroke onChange('25:00')
    fireEvent.blur(input)
    expect(input.value).toBe('25:00')             // not wiped
    expect(onChange).not.toHaveBeenLastCalledWith('') // never propagates empty for invalid input
  })

  it('clears to "" on blur only when the field is empty', () => {
    const onChange = vi.fn()
    render(<TimeInput24 id="t" ariaLabel="Fill-up time" value="" onChange={onChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('is reachable by its accessible name', () => {
    render(<TimeInput24 id="t" ariaLabel="Fill-up time" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('Fill-up time')).toBeInTheDocument()
  })

  it('sets no native pattern (a pattern would block raw "2200" on Enter-submit)', () => {
    render(<TimeInput24 id="t" ariaLabel="Fill-up time" value="" onChange={() => {}} />)
    expect(screen.getByRole('textbox')).not.toHaveAttribute('pattern')
  })
})
