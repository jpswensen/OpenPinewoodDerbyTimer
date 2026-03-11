import { test, expect } from '@playwright/test'

test.describe('Complete Race Flow', () => {
  test('navigate to home page', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('PWDTimer')).toBeVisible()
    await expect(page.getByText(/modernized race management/i)).toBeVisible()
  })

  test('navigate to racers page', async ({ page }) => {
    await page.goto('/racers')
    await expect(page.getByRole('heading', { name: /racers/i })).toBeVisible()
  })

  test('navigate to heats page', async ({ page }) => {
    await page.goto('/heats')
    await expect(page.getByText('Heats')).toBeVisible()
  })

  test('navigate to race page', async ({ page }) => {
    await page.goto('/race')
    await expect(page.getByRole('heading', { name: /race/i })).toBeVisible()
  })

  test('navigate to results page', async ({ page }) => {
    await page.goto('/results')
    await expect(page.getByRole('heading', { name: /results/i })).toBeVisible()
  })

  test('navigate to certificates page', async ({ page }) => {
    await page.goto('/certificates')
    await expect(page.getByRole('heading', { name: /certificates/i })).toBeVisible()
  })

  test('navigate to settings page', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible()
  })

  test('sidebar navigation works', async ({ page }) => {
    await page.goto('/')

    // Click racers link
    await page.getByRole('link', { name: 'Racers' }).click()
    await expect(page).toHaveURL(/\/racers/)

    // Click heats link
    await page.getByRole('link', { name: 'Heats' }).click()
    await expect(page).toHaveURL(/\/heats/)

    // Click home link
    await page.getByRole('link', { name: 'Home' }).click()
    await expect(page).toHaveURL(/^\/$/)
  })

  test('race setup to heats flow', async ({ page }) => {
    // Go to heats page
    await page.goto('/heats')
    await expect(page.getByText('Heats')).toBeVisible()

    // Create a new race
    await page.getByText('+ New race').click()
    await page.getByPlaceholder(/race name/i).fill('Test Race')

    // Look for a create/save button within the dialog
    const createBtn = page.getByRole('button', { name: /create|save/i })
    if (await createBtn.isVisible()) {
      await createBtn.click()
    }
  })
})
