import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, cleanup } from '../../../__tests__/test-utils'
import { fireEvent } from '@testing-library/react'
import type { DriveSession, DriveSessionListResponse } from '../../../types/livelink'

// ─────────────────────────────────────────────────────────────────────────────
// Harness note (mirrors the Task-1/Task-2 LiveLink precedent — assertions and
// fixtures are exactly the brief's; only the i18n mock is overridden locally):
//
// `fetchSessions` lists `t` in its `useCallback` deps and the mount effect
// depends on `fetchSessions`. The GLOBAL react-i18next mock (src/__tests__/
// setup.ts) returns a FRESH `t` on every render, so `fetchSessions` is a new
// reference every render and `useEffect([fetchSessions])` re-fires after each
// data-commit re-render — a runaway refetch loop that makes the exact
// `getSessions.mock.calls` array this suite asserts (`[['V1', { limit: 50 }]]`)
// impossible. Real react-i18next memoizes `t`, so this loop is a TEST artifact,
// never a production behaviour. We override the mock LOCALLY with a STABLE
// module-level `t` (same key-echo shape as the global mock) so `fetchSessions`
// is stable across renders — the fetch fires exactly once, as in production.
// This is a TEST-harness fix only; the component's fetch/effect logic is
// unchanged (reskin = rendering-only).
// ─────────────────────────────────────────────────────────────────────────────
vi.mock('react-i18next', () => {
  const t = (key: string) => key
  return {
    useTranslation: () => ({
      t,
      i18n: { language: 'en', changeLanguage: () => Promise.resolve() },
    }),
    Trans: ({ children }: { children: ReactNode }) => children,
    initReactI18next: { type: '3rdParty', init: () => {} },
  }
})

const getSessions = vi.fn()
vi.mock('@/services/livelinkService', () => ({
  livelinkService: { getSessions: (vin: string, params: unknown) => getSessions(vin, params) },
}))
vi.mock('@/hooks/useUnitPreference', () => ({ useUnitPreference: () => ({ system: 'imperial', showBoth: false }) }))
vi.mock('@/hooks/useTimeFormat', () => ({ useTimeFormat: () => ({ timeFormat: '12h' }) }))
vi.mock('@/constants/i18n', () => ({ getActiveLocale: () => 'en-US' }))
vi.mock('@/utils/parseAPITimestamp', () => ({ formatAPITimestamp: () => 'Sun, Jul 26', formatTime: () => '12:00' }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import LiveLinkSessionsTab from '../LiveLinkSessionsTab'

// M1: contract-valid typed builders (`satisfies DriveSession`, all required fields incl. `vin`/
// `device_id`/`created_at`). M3: an ENDED session (ended_at set → no in-progress chip) AND an
// IN-PROGRESS session (ended_at null → isActive → the `<Chip tone="success">` renders).
const endedSession = {
  id: 5, vin: 'V1', device_id: 'DEV1', created_at: 'x',
  started_at: 'x', ended_at: 'x', duration_seconds: 3600, distance_km: 100,
  max_speed: 60, avg_speed: 40, avg_rpm: 2000, max_rpm: 4000,
  avg_coolant_temp: 90, max_coolant_temp: 95, start_odometer: 1000, end_odometer: 1100,
} satisfies DriveSession
const inProgressSession = { ...endedSession, id: 6, ended_at: null } satisfies DriveSession
const list = (over: Partial<DriveSessionListResponse> = {}) =>
  ({ sessions: [endedSession], total: 1, ...over }) satisfies DriveSessionListResponse

beforeEach(() => {
  vi.clearAllMocks()
  getSessions.mockResolvedValue(list())
})

describe('LiveLinkSessionsTab', () => {
  it('renders the session figures via the component formatters and calls getSessions(vin, {limit:50}) (fails if the list, a formatter, or the fetch args break)', async () => {
    render(<LiveLinkSessionsTab vin="V1" />)
    expect(await screen.findByText('1h 0m')).toBeInTheDocument() // formatDuration(3600)
    expect(screen.getByText('100 mi')).toBeInTheDocument()        // formatOdometer(100), imperial
    expect(getSessions.mock.calls).toStrictEqual([['V1', { limit: 50 }]]) // M1: exact call identity
  })

  it('shows the in-progress chip only for an active (unended) session — both ways (fails if the isActive marker is dropped or shown unconditionally)', async () => {
    render(<LiveLinkSessionsTab vin="V1" />) // default = endedSession (ended_at set)
    await screen.findByText('1h 0m')
    expect(screen.queryByText('livelink.sessions.inProgress')).not.toBeInTheDocument()
    cleanup()

    getSessions.mockResolvedValue(list({ sessions: [inProgressSession] }))
    render(<LiveLinkSessionsTab vin="V1" />)
    expect(await screen.findByText('livelink.sessions.inProgress')).toBeInTheDocument()
  })

  it('expands and collapses the detail grid on toggle — both ways (fails if the expand toggle is unwired)', async () => {
    render(<LiveLinkSessionsTab vin="V1" />)
    await screen.findByText('1h 0m')
    // the expanded Tile label is absent when collapsed
    expect(screen.queryByText('livelink.sessions.duration')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button')) // the only button is the card header toggle
    expect(screen.getByText('livelink.sessions.duration')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('livelink.sessions.duration')).not.toBeInTheDocument()
  })

  it('shows the empty state when there are no sessions (fails if the empty branch is dropped)', async () => {
    getSessions.mockResolvedValue(list({ sessions: [], total: 0 }))
    render(<LiveLinkSessionsTab vin="V1" />)
    expect(await screen.findByText('livelink.sessions.noRecords')).toBeInTheDocument()
  })
})
