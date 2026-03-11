import { test, expect } from '@playwright/test'

test.describe('Visual Regression - Key Pages', () => {
  const pages = [
    { name: 'home', path: '/' },
    { name: 'racers', path: '/racers' },
    { name: 'heats', path: '/heats' },
    { name: 'race', path: '/race' },
    { name: 'results', path: '/results' },
    { name: 'certificates', path: '/certificates' },
    { name: 'settings', path: '/settings' },
  ]

  for (const { name, path } of pages) {
    test(`screenshot: ${name} page (light mode)`, async ({ page }) => {
      await page.goto(path)
      // Wait for data to load
      await page.waitForTimeout(500)
      await expect(page).toHaveScreenshot(`${name}-light.png`, {
        maxDiffPixelRatio: 0.05,
      })
    })

    test(`screenshot: ${name} page (dark mode)`, async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem('pwdtimer-theme', 'dark')
      })
      await page.goto(path)
      await page.waitForTimeout(500)
      await expect(page).toHaveScreenshot(`${name}-dark.png`, {
        maxDiffPixelRatio: 0.05,
      })
    })
  }
})
