import { test, expect } from './helpers/fixtures'

test.describe('Settings', () => {
  test('settings page loads', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible({
      timeout: 15000,
    })
  })

  // The light/dark theme control moved out of Settings into the top-bar
  // toggle (an IconButton labelled "Toggle theme"), so assert it there.
  test('theme toggle is available in the top bar', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('button', { name: 'Toggle theme' })).toBeVisible({ timeout: 15000 })
  })
})
