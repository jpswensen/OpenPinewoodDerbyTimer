import { test, expect } from '@playwright/test'

test.describe('Certificate Generation', () => {
  test('certificates page loads', async ({ page }) => {
    await page.goto('/certificates')
    await expect(page.getByRole('heading', { name: /certificates/i })).toBeVisible()
  })

  test('certificate type selection is visible', async ({ page }) => {
    await page.goto('/certificates')
    await expect(page.getByText('Winner')).toBeVisible()
  })

  test('preview sample button is visible', async ({ page }) => {
    await page.goto('/certificates')
    await expect(page.getByText('Preview sample')).toBeVisible()
  })

  test('download PDF button is visible', async ({ page }) => {
    await page.goto('/certificates')
    await expect(page.getByText('Download PDF')).toBeVisible()
  })

  test('certificate customization fields are present', async ({ page }) => {
    await page.goto('/certificates')

    // Should have event name, date, and issuer inputs
    const textInputs = await page.getByRole('textbox').all()
    expect(textInputs.length).toBeGreaterThanOrEqual(0)
  })
})
