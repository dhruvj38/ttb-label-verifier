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
const samplesDirectory = path.join(root, 'public/samples')
await mkdir(samplesDirectory, { recursive: true })
await page.screenshot({
  path: path.join(samplesDirectory, 'valid-bourbon.png'),
  clip: { x: 0, y: 0, width: 1400, height: 1800 },
})

await page.setViewportSize({ width: 1600, height: 1900 })
await page.setContent(`
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 1600px; height: 1900px; overflow: hidden; }
    body {
      background:
        radial-gradient(circle at 18% 12%, #938c80 0, #5b5b58 42%, #30343a 100%);
    }
    .photo {
      position: absolute;
      left: 120px;
      top: 48px;
      width: 1400px;
      height: 1800px;
      overflow: hidden;
      transform: perspective(3200px) rotateY(-5deg) rotateZ(1.8deg) scale(.94);
      transform-origin: center;
      filter: brightness(.83) contrast(.82) saturate(.62);
      box-shadow: 8px 22px 55px #111b;
    }
    .photo svg { display: block; width: 100%; height: 100%; }
    .lighting, .glare { position: absolute; inset: 0; pointer-events: none; }
    .lighting {
      background:
        radial-gradient(circle at 28% 42%, transparent 0 20%, #1118 74% 100%),
        linear-gradient(105deg, #10182066 0%, transparent 38%, #e9d7ae24 72%, #1116 100%);
      mix-blend-mode: multiply;
    }
    .glare {
      left: 62%;
      width: 12%;
      background: linear-gradient(90deg, transparent, #fff8, #fff3, transparent);
      transform: skewX(-9deg);
      filter: blur(12px);
      opacity: .55;
    }
  </style>
  <div class="photo">
    ${source}
    <div class="lighting"></div>
    <div class="glare"></div>
  </div>
`)
await page.screenshot({
  path: path.join(samplesDirectory, 'challenging-photo.png'),
  clip: { x: 0, y: 0, width: 1600, height: 1900 },
})
await browser.close()
