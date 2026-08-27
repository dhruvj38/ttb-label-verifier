import { expect, test } from '@playwright/test'

test('sample label runs through real same-origin OCR', async ({ page }) => {
  const externalRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (
      !['blob:', 'data:'].includes(url.protocol) &&
      !['127.0.0.1', 'localhost'].includes(url.hostname)
    )
      externalRequests.push(request.url())
  })

  await page.goto('./')
  await expect(
    page.getByRole('heading', { name: /Make the label say/ }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Try sample label' }).click()
  await expect(page.getByLabel('Brand name')).toHaveValue('OLD TOM DISTILLERY')
  await page.getByRole('button', { name: 'Analyze label' }).click()

  await expect(
    page.getByText(/Manual review remains|Differences found/),
  ).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByText(/OCR confidence/)).toBeVisible()
  await expect(page.getByText('Brand name').last()).toBeVisible()
  await expect(
    page
      .locator('.check-result')
      .filter({ hasText: 'Brand name' })
      .getByText('Pass'),
  ).toBeVisible()
  const metrics = (await page.locator('.ocr-metrics').innerText()).replace(
    /\n/g,
    ' · ',
  )
  console.log(`REAL_OCR_METRICS: ${metrics}`)
  expect(externalRequests).toEqual([])
})

test('layout remains usable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await expect(
    page.getByRole('button', { name: 'Choose images' }),
  ).toBeVisible()
  await expect(page.getByText('Your images stay on this device')).toBeVisible()
})
