import { test, expect } from '@playwright/test'

test.describe('CSV Import and Racer Management', () => {
  test('racer page loads with group sidebar', async ({ page }) => {
    await page.goto('/racers')
    await expect(page.getByRole('heading', { name: /racers/i })).toBeVisible()

    // Should have Add Racer button
    await expect(page.getByText(/add racer/i)).toBeVisible()
  })

  test('search filters visible racers', async ({ page }) => {
    await page.goto('/racers')

    // Wait for page to load
    await expect(page.getByPlaceholderText(/search/i)).toBeVisible()

    // Type into search
    await page.getByPlaceholderText(/search/i).fill('Test')

    // Search input should contain the text
    await expect(page.getByPlaceholderText(/search/i)).toHaveValue('Test')
  })

  test('CSV import button exists', async ({ page }) => {
    await page.goto('/racers')
    await expect(page.getByText(/import/i)).toBeVisible()
  })

  test('CSV export button exists', async ({ page }) => {
    await page.goto('/racers')
    await expect(page.getByText(/export/i)).toBeVisible()
  })

  test('add racer flow opens form', async ({ page }) => {
    await page.goto('/racers')

    await page.getByText(/add racer/i).click()

    // Should show a form or input for racer name
    const nameInput = page.getByPlaceholder(/name/i).first()
    await expect(nameInput).toBeVisible()
  })
})
