import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const setTheme = vi.fn()
let user: { theme?: string | null } | null = null

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user }) }))
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ setTheme }) }))

import { useThemeSync } from '../useThemeSync'

beforeEach(() => {
  vi.clearAllMocks()
  user = null
})

describe('useThemeSync', () => {
  it('applies the user’s saved theme when it is light or dark', () => {
    user = { theme: 'light' }
    renderHook(() => useThemeSync())
    expect(setTheme.mock.calls).toStrictEqual([['light']])
  })

  it('leaves an unset (null) theme to the local seed', () => {
    user = { theme: null }
    renderHook(() => useThemeSync())
    expect(setTheme).not.toHaveBeenCalled()
  })

  it('ignores a theme outside the light/dark set', () => {
    user = { theme: 'solarized' }
    renderHook(() => useThemeSync())
    expect(setTheme).not.toHaveBeenCalled()
  })

  it('does nothing for an unauthenticated (null) user', () => {
    user = null
    renderHook(() => useThemeSync())
    expect(setTheme).not.toHaveBeenCalled()
  })

  it('re-applies only when the DB theme value changes', () => {
    user = { theme: 'dark' }
    const { rerender } = renderHook(() => useThemeSync())
    expect(setTheme.mock.calls).toStrictEqual([['dark']])
    // Same value → effect dep unchanged → no extra apply.
    rerender()
    expect(setTheme.mock.calls).toStrictEqual([['dark']])
    // New value → one more apply.
    user = { theme: 'light' }
    rerender()
    expect(setTheme.mock.calls).toStrictEqual([['dark'], ['light']])
  })
})
