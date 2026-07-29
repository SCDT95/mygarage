import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ThemeProvider, useTheme } from '../ThemeContext'

// ThemeContext is auth-agnostic and synchronous: it seeds from localStorage and
// applies the class before paint. The DB read (useThemeSync) and the account
// write (useThemePreference) are tested separately — no axios here.

function ThemeConsumer() {
  const { theme, toggleTheme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <button onClick={toggleTheme}>Toggle</button>
      <button onClick={() => setTheme('light')}>Set Light</button>
      <button onClick={() => setTheme('dark')}>Set Dark</button>
    </div>
  )
}

function renderProvider() {
  return render(
    <ThemeProvider>
      <ThemeConsumer />
    </ThemeProvider>
  )
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('light', 'dark')

    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'theme-color')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', '')
  })

  it('useTheme throws when used outside ThemeProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<ThemeConsumer />)).toThrow('useTheme must be used within a ThemeProvider')
  })

  it('defaults to dark when nothing is stored', () => {
    renderProvider()
    expect(screen.getByTestId('theme-value')).toHaveTextContent('dark')
  })

  it('seeds the theme from localStorage', () => {
    localStorage.setItem('theme', 'light')
    renderProvider()
    expect(screen.getByTestId('theme-value')).toHaveTextContent('light')
  })

  it('renders children synchronously (no fetch gate)', () => {
    const { container } = renderProvider()
    // The old null-until-initialized gate is gone — the consumer is present at once.
    expect(container.querySelector('[data-testid="theme-value"]')).not.toBeNull()
  })

  it('applies the theme class to the document element', () => {
    renderProvider()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('toggles dark -> light, updating value, localStorage and class', () => {
    renderProvider()
    expect(screen.getByTestId('theme-value')).toHaveTextContent('dark')

    act(() => {
      screen.getByText('Toggle').click()
    })

    expect(screen.getByTestId('theme-value')).toHaveTextContent('light')
    expect(localStorage.getItem('theme')).toBe('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('setTheme persists the exact value to localStorage', () => {
    renderProvider()

    act(() => {
      screen.getByText('Set Light').click()
    })
    expect(screen.getByTestId('theme-value')).toHaveTextContent('light')
    expect(localStorage.getItem('theme')).toBe('light')

    act(() => {
      screen.getByText('Set Dark').click()
    })
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('updates the theme-color meta to the nav colour on mount and toggle', () => {
    renderProvider()
    const meta = () => document.querySelector('meta[name="theme-color"]')!.getAttribute('content')

    expect(meta()).toBe('#0b0e13')

    act(() => {
      screen.getByText('Toggle').click()
    })
    expect(meta()).toBe('#ffffff')
  })
})
