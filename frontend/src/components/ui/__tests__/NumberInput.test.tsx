import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { render } from '../../../__tests__/test-utils'
import { setActiveLocale } from '@/constants/i18n'
import { INVALID_NUMBER } from '@/schemas/shared'
import NumberInput, { registerDecimal } from '../NumberInput'

interface Values { amount: number | typeof INVALID_NUMBER | undefined }
const onSubmit = vi.fn()

function Harness(): React.JSX.Element {
  const { register, handleSubmit } = useForm<Values>()
  return (
    <form onSubmit={handleSubmit(v => onSubmit(v))}>
      <label htmlFor="amount">Amount</label>
      <NumberInput id="amount" {...registerDecimal(register, 'amount')} />
      <button type="submit">Save</button>
    </form>
  )
}

describe('NumberInput', () => {
  it('renders a textbox, not a spinbutton, so locale separators survive', () => {
    render(<Harness />)
    expect(screen.getByRole('textbox', { name: 'Amount' })).toBeInTheDocument()
    expect(screen.getByLabelText('Amount')).toHaveAttribute('inputMode', 'decimal')
  })

  it('normalizes a comma decimal to a number', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Amount'), '528,25')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({ amount: 528.25 })
  })

  it('submits undefined for an untouched field', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({ amount: undefined })
  })

  it('emits the invalid sentinel rather than dropping bad text', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Amount'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({ amount: INVALID_NUMBER })
  })

  it('follows the selected language for the ambiguous shape', async () => {
    setActiveLocale('pl')
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Amount'), '1,234')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({ amount: 1.234 })
    setActiveLocale('en')
  })

  it('passes a number default through untouched in edit mode', async () => {
    const user = userEvent.setup()
    function EditHarness(): React.JSX.Element {
      const { register, handleSubmit } = useForm<Values>({ defaultValues: { amount: 42.5 } })
      return (
        <form onSubmit={handleSubmit(v => onSubmit(v))}>
          <label htmlFor="amount">Amount</label>
          <NumberInput id="amount" {...registerDecimal(register, 'amount')} />
          <button type="submit">Save</button>
        </form>
      )
    }
    render(<EditHarness />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({ amount: 42.5 })
  })

  it('renders the ambiguity hint when given one', () => {
    render(<NumberInput id="x" ambiguityHint="Reading as 1.234" />)
    expect(screen.getByText('Reading as 1.234')).toBeInTheDocument()
  })
})
