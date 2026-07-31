import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import type { HoursRecord } from '../../../types/hours'

interface ListProps {
  vin: string
  onAddClick: () => void
  onEditClick: (record: HoursRecord) => void
}
interface FormProps {
  vin: string
  record?: HoursRecord
  onClose: () => void
  onSuccess: () => void
}

const listMock = vi.fn<(props: ListProps) => void>()
const formMock = vi.fn<(props: FormProps) => void>()

vi.mock('../../HoursRecordList', () => ({
  default: (props: ListProps) => {
    listMock(props)
    return <div>HoursRecordList</div>
  },
}))
vi.mock('../../HoursRecordForm', () => ({
  default: (props: FormProps) => {
    formMock(props)
    return <div>HoursRecordForm</div>
  },
}))

import HoursTab from '../HoursTab'

const record = { id: 3 } as unknown as HoursRecord

describe('HoursTab — add/edit/close wiring (mirrors OdometerTab)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })


  it('renders HoursRecordList with the vin, form absent until requested', () => {
    render(<HoursTab vin="V1" />)
    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ vin: 'V1' }))
    expect(screen.queryByText('HoursRecordForm')).not.toBeInTheDocument()
  })

  it("onAddClick opens the form in CREATE mode (no record prop) (fails if Add doesn't open the form or leaks a stale record)", () => {
    render(<HoursTab vin="V1" />)
    const { onAddClick } = listMock.mock.calls[0][0]
    act(() => onAddClick())
    expect(screen.getByText('HoursRecordForm')).toBeInTheDocument()
    expect(formMock).toHaveBeenCalledWith(expect.objectContaining({ vin: 'V1', record: undefined }))
  })

  it('onEditClick opens the form in EDIT mode with the SAME record (fails if Edit opens create mode or passes the wrong record)', () => {
    render(<HoursTab vin="V1" />)
    const { onEditClick } = listMock.mock.calls[0][0]
    act(() => onEditClick(record))
    expect(screen.getByText('HoursRecordForm')).toBeInTheDocument()
    expect(formMock).toHaveBeenCalledWith(expect.objectContaining({ vin: 'V1', record }))
  })

  it("the form's onClose hides it again (fails if close is unwired)", () => {
    render(<HoursTab vin="V1" />)
    const { onAddClick } = listMock.mock.calls[0][0]
    act(() => onAddClick())
    expect(screen.getByText('HoursRecordForm')).toBeInTheDocument()
    const { onClose } = formMock.mock.calls[formMock.mock.calls.length - 1][0]
    act(() => onClose())
    expect(screen.queryByText('HoursRecordForm')).not.toBeInTheDocument()
  })
})
