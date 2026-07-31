import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useHoursRecords,
  useCreateHoursRecord,
  useUpdateHoursRecord,
  useDeleteHoursRecord,
} from '../useHoursRecords'
import api from '../../../services/api'

vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return {
    qc,
    Wrap: function Wrap({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: qc }, children)
    },
  }
}

describe('useHoursRecords', () => {
  it('calls GET /vehicles/:vin/hours and is keyed by vin', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { records: [], total: 0, latest_engine_hours: null },
    } as { data: unknown })

    const { Wrap } = wrapper()
    const { result } = renderHook(() => useHoursRecords('1HGCM82633A004352'), { wrapper: Wrap })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(api.get).toHaveBeenCalledWith('/vehicles/1HGCM82633A004352/hours')
    expect(result.current.data?.total).toBe(0)
  })

  it('is disabled until a vin is provided', () => {
    const { Wrap } = wrapper()
    const { result } = renderHook(() => useHoursRecords(''), { wrapper: Wrap })

    expect(result.current.fetchStatus).toBe('idle')
    expect(api.get).not.toHaveBeenCalled()
  })
})

describe('useCreateHoursRecord', () => {
  it('POSTs the payload and invalidates the hours-records list', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { id: 1, vin: '1HGCM82633A004352', date: '2026-07-30', engine_hours: '812.4' },
    } as { data: unknown })

    const { Wrap, qc } = wrapper()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useCreateHoursRecord('1HGCM82633A004352'), { wrapper: Wrap })

    await result.current.mutateAsync({
      vin: '1HGCM82633A004352',
      date: '2026-07-30',
      engine_hours: 812.4,
    })

    expect(api.post).toHaveBeenCalledWith('/vehicles/1HGCM82633A004352/hours', {
      vin: '1HGCM82633A004352',
      date: '2026-07-30',
      engine_hours: 812.4,
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['hoursRecords', '1HGCM82633A004352'] })
  })
})

describe('useUpdateHoursRecord', () => {
  it('PUTs /vehicles/:vin/hours/:id with the id stripped from the body', async () => {
    vi.mocked(api.put).mockResolvedValueOnce({ data: { id: 5 } } as { data: unknown })

    const { Wrap, qc } = wrapper()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateHoursRecord('1HGCM82633A004352'), { wrapper: Wrap })

    await result.current.mutateAsync({ id: 5, engine_hours: 900.1 })

    expect(api.put).toHaveBeenCalledWith('/vehicles/1HGCM82633A004352/hours/5', {
      engine_hours: 900.1,
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['hoursRecords', '1HGCM82633A004352'] })
  })
})

describe('useDeleteHoursRecord', () => {
  it('DELETEs /vehicles/:vin/hours/:id and invalidates the list', async () => {
    vi.mocked(api.delete).mockResolvedValueOnce({ data: null } as { data: unknown })

    const { Wrap, qc } = wrapper()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteHoursRecord('1HGCM82633A004352'), { wrapper: Wrap })

    await result.current.mutateAsync(9)

    expect(api.delete).toHaveBeenCalledWith('/vehicles/1HGCM82633A004352/hours/9')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['hoursRecords', '1HGCM82633A004352'] })
  })
})
