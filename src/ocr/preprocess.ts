const MAX_OCR_DIMENSION = 2200

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
  const pixels = image.data
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = Math.round(
      0.299 * pixels[index]! +
        0.587 * pixels[index + 1]! +
        0.114 * pixels[index + 2]!,
    )
    const adjusted = Math.max(0, Math.min(255, (luminance - 128) * 1.18 + 128))
    pixels[index] = adjusted
    pixels[index + 1] = adjusted
    pixels[index + 2] = adjusted
  }
  context.putImageData(image, 0, 0)
  return canvasToBlob(canvas)
}

export { MAX_OCR_DIMENSION }
