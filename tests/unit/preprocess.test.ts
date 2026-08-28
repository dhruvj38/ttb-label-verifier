import { describe, expect, it } from 'vitest'
import { enhanceForOcr } from '../../src/ocr/preprocess'

function grayscalePixels(values: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(
    values.flatMap((value) => [value, value, value, 255]),
  )
}

describe('OCR image enhancement', () => {
  it('normalizes a narrow tonal range while preserving luminance order', () => {
    const pixels = grayscalePixels([80, 100, 140, 160])
    enhanceForOcr(pixels, 4, 1)

    const values = [pixels[0]!, pixels[4]!, pixels[8]!, pixels[12]!]
    expect(values[0]).toBeLessThan(40)
    expect(values[3]).toBeGreaterThan(240)
    expect(values).toEqual([...values].sort((left, right) => left - right))
    expect(pixels[0]).toBe(pixels[1])
    expect(pixels[1]).toBe(pixels[2])
  })

  it('restores local text contrast on both shadowed and bright regions', () => {
    const values = Array.from({ length: 256 }, (_, x) => {
      const background = x < 128 ? 42 : 232
      return x % 16 < 4 ? background - (x < 128 ? 18 : 52) : background
    })
    const pixels = grayscalePixels(values)
    enhanceForOcr(pixels, 256, 1)

    const output = Array.from({ length: 256 }, (_, x) => pixels[x * 4]!)
    expect(output[8]! - output[0]!).toBeGreaterThan(18)
    expect(output[136]! - output[128]!).toBeGreaterThan(30)
  })
})
