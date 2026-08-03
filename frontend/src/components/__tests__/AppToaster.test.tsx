import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import AppToaster from '../AppToaster'

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark' }),
}))

describe('AppToaster', () => {
  it('renders outside #root so a drawer marking #root inert cannot reach it', () => {
    // Mirrors the real DOM: index.html has <div id="root">, and Drawer.tsx
    // sets inert on exactly that element while any drawer is open.
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)

    render(<AppToaster />, { container: root })

    const toaster = document.querySelector('section[aria-label*="Notifications"]')
    expect(toaster).not.toBeNull()
    // The assertion that matters: not merely "exists", but "not a descendant
    // of #root". Without the portal this is false and the toast is inert.
    expect(root.contains(toaster!)).toBe(false)

    root.setAttribute('inert', '')
    expect(toaster!.closest('[inert]')).toBeNull()

    root.remove()
  })
})
