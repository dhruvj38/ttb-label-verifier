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
  const netContents = page.getByLabel('Net contents')
  await netContents.fill('garbage 750 mL')
  await expect(netContents).toHaveAttribute('aria-invalid', 'true')
  await expect(
    page.getByText('Enter a positive number followed by mL, L, or fl oz.'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Analyze label' }),
  ).toBeDisabled()
  await netContents.fill('750 mL')
  await expect(netContents).not.toHaveAttribute('aria-invalid')
  await expect(
    page.getByRole('button', { name: 'Analyze label' }),
  ).toBeEnabled()
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

  await page.setViewportSize({ width: 390, height: 844 })
  const completedDimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(completedDimensions.scrollWidth).toBeLessThanOrEqual(
    completedDimensions.clientWidth,
  )

  await expect(
    page
      .locator('.check-result')
      .filter({ hasText: 'Warning format' })
      .getByText('Needs review'),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Inspect warning formatting' }).click()
  const inspection = page.getByRole('dialog', {
    name: 'Inspect government warning',
  })
  await expect(inspection).toBeVisible()
  const zoom = inspection.getByRole('slider', { name: 'Zoom', exact: true })
  await expect(zoom).toHaveValue('150')
  await zoom.fill('300')
  await expect(inspection.getByText('300%')).toBeVisible()
  const viewport = inspection.getByLabel(
    'Zoomed label image. Use arrow keys or touch to pan.',
  )
  await expect(viewport).toBeVisible()
  const zoomedImage = inspection.getByAltText(/Zoomable label evidence/)
  const zoomDimensions = await zoomedImage.evaluate((image) => ({
    imageHeight: image.clientHeight,
    viewportHeight: image.parentElement?.clientHeight ?? 0,
  }))
  expect(zoomDimensions.imageHeight).toBeGreaterThan(
    zoomDimensions.viewportHeight * 2,
  )
  const panned = await viewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    return element.scrollTop
  })
  expect(panned).toBeGreaterThan(0)
  await inspection.getByRole('button', { name: 'Close inspection' }).click()
  await expect(inspection).not.toBeVisible()

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
