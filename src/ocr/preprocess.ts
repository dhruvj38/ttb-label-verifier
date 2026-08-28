const MAX_OCR_DIMENSION = 2200
const CONTRAST_TILE_SIZE = 128
const HISTOGRAM_LEVELS = 256

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else
        reject(
          new Error('The image could not be prepared for text recognition.'),
        )
    }, 'image/png')
  })
}

function percentile(
  histogram: Uint32Array,
  pixelCount: number,
  fraction: number,
): number {
  const target = pixelCount * fraction
  let seen = 0
  for (let value = 0; value < histogram.length; value += 1) {
    seen += histogram[value]!
    if (seen >= target) return value
  }
  return 255
}

function contrastMap(
  luminance: Uint8Array,
  width: number,
  xStart: number,
  yStart: number,
  tileWidth: number,
  tileHeight: number,
): Uint8Array {
  const histogram = new Uint32Array(HISTOGRAM_LEVELS)
  for (let y = yStart; y < yStart + tileHeight; y += 1) {
    const row = y * width
    for (let x = xStart; x < xStart + tileWidth; x += 1) {
      const value = luminance[row + x]!
      histogram[value] = histogram[value]! + 1
    }
  }

  // CLAHE recovers text under shadows and uneven lighting without letting one
  // glare patch dictate the contrast of the whole photograph.
  const pixelCount = tileWidth * tileHeight
  const clipLimit = Math.max(2, Math.floor((pixelCount * 3) / 256))
  let excess = 0
  for (let value = 0; value < histogram.length; value += 1) {
    if (histogram[value]! > clipLimit) {
      excess += histogram[value]! - clipLimit
      histogram[value] = clipLimit
    }
  }
  const shared = Math.floor(excess / HISTOGRAM_LEVELS)
  const remainder = excess % HISTOGRAM_LEVELS
  for (let value = 0; value < histogram.length; value += 1) {
    histogram[value] = histogram[value]! + shared + (value < remainder ? 1 : 0)
  }

  const map = new Uint8Array(HISTOGRAM_LEVELS)
  let cumulative = 0
  for (let value = 0; value < histogram.length; value += 1) {
    cumulative += histogram[value]!
    map[value] = Math.round((cumulative / pixelCount) * 255)
  }
  return map
}

export function enhanceForOcr(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const pixelCount = width * height
  const luminance = new Uint8Array(pixelCount)
  const histogram = new Uint32Array(HISTOGRAM_LEVELS)

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const index = pixel * 4
    const value = Math.round(
      0.299 * pixels[index]! +
        0.587 * pixels[index + 1]! +
        0.114 * pixels[index + 2]!,
    )
    luminance[pixel] = value
    histogram[value] = histogram[value]! + 1
  }

  const low = percentile(histogram, pixelCount, 0.01)
  const high = percentile(histogram, pixelCount, 0.99)
  if (high - low >= 24) {
    for (let pixel = 0; pixel < luminance.length; pixel += 1) {
      luminance[pixel] = Math.max(
        0,
        Math.min(
          255,
          Math.round(((luminance[pixel]! - low) * 255) / (high - low)),
        ),
      )
    }
  }

  const tilesX = Math.ceil(width / CONTRAST_TILE_SIZE)
  const tilesY = Math.ceil(height / CONTRAST_TILE_SIZE)
  const maps: Uint8Array[] = []
  for (let tileY = 0; tileY < tilesY; tileY += 1) {
    for (let tileX = 0; tileX < tilesX; tileX += 1) {
      const xStart = tileX * CONTRAST_TILE_SIZE
      const yStart = tileY * CONTRAST_TILE_SIZE
      maps.push(
        contrastMap(
          luminance,
          width,
          xStart,
          yStart,
          Math.min(CONTRAST_TILE_SIZE, width - xStart),
          Math.min(CONTRAST_TILE_SIZE, height - yStart),
        ),
      )
    }
  }

  for (let y = 0; y < height; y += 1) {
    const mapY = Math.min(tilesY - 1, Math.floor(y / CONTRAST_TILE_SIZE))
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x
      const index = pixel * 4
      const globalValue = luminance[pixel]!
      const localValue =
        maps[mapY * tilesX + Math.floor(x / CONTRAST_TILE_SIZE)]![globalValue]!
      // Keep most of the natural grayscale so tile boundaries do not damage
      // decorative lettering; the local component restores shadowed regions.
      const adjusted = Math.round(globalValue * 0.58 + localValue * 0.42)
      pixels[index] = adjusted
      pixels[index + 1] = adjusted
      pixels[index + 2] = adjusted
    }
  }
}

export async function preprocessImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(
      'This image could not be read. Try exporting it as a new PNG or JPEG.',
    )
  }

  const scale = Math.min(
    1,
    MAX_OCR_DIMENSION / Math.max(bitmap.width, bitmap.height),
  )
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    bitmap.close()
    throw new Error(
      'This browser cannot prepare the image for text recognition.',
    )
  }

  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const image = context.getImageData(0, 0, width, height)
  enhanceForOcr(image.data, width, height)
  context.putImageData(image, 0, 0)
  return canvasToBlob(canvas)
}

export { MAX_OCR_DIMENSION }
