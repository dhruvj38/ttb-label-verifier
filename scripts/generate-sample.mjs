import { chromium } from '@playwright/test'
import { readFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = await readFile(
  path.join(root, 'tests/fixtures/valid-label.svg'),
  'utf8',
)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 1800 } })
await page.setContent(
  `<style>html,body{margin:0;width:1400px;height:1800px}</style>${source}`,
)
await mkdir(path.join(root, 'public/samples'), { recursive: true })
await page.screenshot({
  path: path.join(root, 'public/samples/valid-bourbon.png'),
  clip: { x: 0, y: 0, width: 1400, height: 1800 },
})
await browser.close()
