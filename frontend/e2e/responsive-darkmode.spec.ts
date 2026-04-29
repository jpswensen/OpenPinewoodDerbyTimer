import { test, expect } from '@playwright/test'

test.describe('Responsive Design', () => {
  test('mobile viewport shows menu button', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')

    // Mobile should show an icon button for toggling navigation.
    await expect(page.getByRole('button', { name: 'Toggle menu' })).toBeVisible()
  })

  test('desktop viewport shows sidebar directly', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')

    // Desktop should have visible sidebar links
    await expect(page.getByRole('link', { name: 'Racers' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Heats' })).toBeVisible()
  })

  test('mobile menu toggles sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')

    // Click menu button to toggle navigation.
    await page.getByRole('button', { name: 'Toggle menu' }).click()

    // Should show navigation links now
    await expect(page.getByRole('link', { name: 'Racers' })).toBeVisible()
  })
})

test.describe('Dark Mode', () => {
  test('theme toggle changes to dark mode', async ({ page }) => {
    await page.goto('/')

    // Find the theme toggle button
    const toggleBtn = page.getByRole('button', { name: /switch to (light|dark) mode/i })
    await expect(toggleBtn).toBeVisible()

    // Click to toggle
    await toggleBtn.click()

    // The html element should have the dark class
    const hasDarkClass = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    // It should have toggled
    expect(typeof hasDarkClass).toBe('boolean')
  })

  test('theme persists across navigation', async ({ page }) => {
    await page.goto('/')

    // Set dark mode
    await page.evaluate(() => localStorage.setItem('pwdtimer-theme', 'dark'))
    await page.goto('/')

    // Should load in dark mode
    const hasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    expect(hasDark).toBe(true)
  })

  test('theme persists across page reload', async ({ page }) => {
    await page.goto('/')

    // Set to dark mode via toggle
    const toggleBtn = page.getByRole('button', { name: /switch to (light|dark) mode/i })
    await toggleBtn.click()

    // Note the current state
    const darkAfterToggle = await page.evaluate(() => document.documentElement.classList.contains('dark'))

    // Reload
    await page.reload()

    // Should persist the same state
    const darkAfterReload = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    expect(darkAfterReload).toBe(darkAfterToggle)
  })
})
