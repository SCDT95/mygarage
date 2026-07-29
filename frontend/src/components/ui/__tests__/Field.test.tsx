import { describe, it, expect } from 'vitest'
import { render, screen } from '../../../__tests__/test-utils'
import Field from '../Field'
import Input from '../Input'
import Select from '../Select'
import Textarea from '../Textarea'

describe('Field', () => {
  it('associates the label with the control via the caller id', () => {
    render(
      <Field id="nickname" label="Nickname">
        <input id="nickname" />
      </Field>,
    )
    expect(screen.getByLabelText('Nickname')).toHaveAttribute('id', 'nickname')
  })

  it('puts the required marker INSIDE the accessible name', () => {
    // VehicleEdit.test.tsx:189 queries findByLabelText('edit.nickname *').
    // aria-hidden on the asterisk, or moving it outside the <label>, breaks it.
    render(
      <Field id="nickname" label="Nickname" required>
        <input id="nickname" />
      </Field>,
    )
    expect(screen.getByLabelText('Nickname *')).toBeInTheDocument()
  })

  it('does not hide the required marker behind aria-hidden', () => {
    // getByLabelText (used above and by VehicleEdit.test.tsx) matches on the
    // <label>'s textContent — it does not run the accname algorithm and does
    // NOT exclude aria-hidden descendants. Verified experimentally: wrapping
    // the marker in <span aria-hidden="true"> still passes the test above.
    // getByRole computes the real accessible name (accname), which DOES
    // exclude aria-hidden content, so this is the assertion that actually
    // enforces "plain text, not a decoration."
    render(
      <Field id="nickname" label="Nickname" required>
        <input id="nickname" />
      </Field>,
    )
    expect(screen.getByRole('textbox', { name: 'Nickname *' })).toBeInTheDocument()
  })

  it('puts the unit suffix INSIDE the accessible name', () => {
    // VehicleEdit.test.tsx:237,250,266 query
    // findByLabelText('edit.defTankCapacity (L)').
    render(
      <Field id="def" label="DEF Tank Capacity" unit="L">
        <input id="def" />
      </Field>,
    )
    expect(screen.getByLabelText('DEF Tank Capacity (L)')).toBeInTheDocument()
  })

  it('composes required and unit in that order', () => {
    render(
      <Field id="x" label="Volume" required unit="gal">
        <input id="x" />
      </Field>,
    )
    expect(screen.getByLabelText('Volume * (gal)')).toBeInTheDocument()
  })

  it('renders a string error with an alert role', () => {
    render(
      <Field id="x" label="Cost" error="Required">
        <input id="x" />
      </Field>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Required')
  })

  it('accepts a react-hook-form FieldError object', () => {
    render(
      <Field id="x" label="Cost" error={{ type: 'required', message: 'Required' }}>
        <input id="x" />
      </Field>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Required')
  })

  it('renders no alert when there is no error', () => {
    render(
      <Field id="x" label="Cost">
        <input id="x" />
      </Field>,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('gives hint and error deterministic ids a raw control can point at', () => {
    // A non-primitive control (raw <input>, custom component) still wires the
    // ids by hand; Field guarantees they exist. The ui primitives auto-wire via
    // FieldContext (tested below) — cloneElement is never used either way.
    const { container } = render(
      <Field id="cost" label="Cost" hint="Excluding tax." error="Required">
        <input id="cost" aria-describedby="cost-hint cost-error" />
      </Field>,
    )
    expect(container.querySelector('#cost-hint')).toHaveTextContent('Excluding tax.')
    expect(container.querySelector('#cost-error')).toHaveTextContent('Required')
    expect(screen.getByLabelText('Cost')).toHaveAccessibleDescription(
      'Excluding tax. Required',
    )
  })

  it('auto-wires aria-describedby on a ui Input (hint + error)', () => {
    render(
      <Field id="cost" label="Cost" hint="Excluding tax." error="Required">
        <Input id="cost" />
      </Field>,
    )
    expect(screen.getByLabelText('Cost')).toHaveAttribute('aria-describedby', 'cost-hint cost-error')
    expect(screen.getByLabelText('Cost')).toHaveAccessibleDescription('Excluding tax. Required')
  })

  it('auto-wires only the hint id when there is no error', () => {
    render(
      <Field id="cost" label="Cost" hint="Excluding tax.">
        <Input id="cost" />
      </Field>,
    )
    expect(screen.getByLabelText('Cost')).toHaveAttribute('aria-describedby', 'cost-hint')
  })

  it('sets no aria-describedby when a Field has neither hint nor error', () => {
    render(
      <Field id="cost" label="Cost">
        <Input id="cost" />
      </Field>,
    )
    expect(screen.getByLabelText('Cost')).not.toHaveAttribute('aria-describedby')
  })

  it('wires Select and Textarea primitives the same way', () => {
    const { rerender } = render(
      <Field id="pick" label="Pick" error="Required">
        <Select id="pick" options={[{ value: 'a', label: 'A' }]} />
      </Field>,
    )
    expect(screen.getByLabelText('Pick')).toHaveAttribute('aria-describedby', 'pick-error')

    rerender(
      <Field id="note" label="Note" hint="Optional.">
        <Textarea id="note" />
      </Field>,
    )
    expect(screen.getByLabelText('Note')).toHaveAttribute('aria-describedby', 'note-hint')
  })

  it('merges a control’s explicit aria-describedby with the Field ids', () => {
    render(
      <Field id="cost" label="Cost" error="Required">
        <Input id="cost" aria-describedby="external-note" />
      </Field>,
    )
    expect(screen.getByLabelText('Cost')).toHaveAttribute(
      'aria-describedby',
      'external-note cost-error',
    )
  })

  it('a primitive outside a Field keeps only its own aria-describedby', () => {
    render(<Input aria-label="loose" aria-describedby="x" />)
    expect(screen.getByLabelText('loose')).toHaveAttribute('aria-describedby', 'x')
  })
})
