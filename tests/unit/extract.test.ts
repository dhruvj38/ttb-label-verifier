import { describe, expect, it } from 'vitest'
import {
  extractAbv,
  extractNetContents,
  parseExpectedNetContents,
} from '../../src/domain/extract'

describe('ABV extraction', () => {
  it.each([
    ['45% Alc./Vol. (90 Proof)', 45],
    ['45% alcohol by volume', 45],
    ['ALCOHOL BY VOLUME: 46.5%', 46.5],
  ])('reads %s', (text, expected) => {
    expect(extractAbv(text).map((item) => item.value)).toContain(expected)
  })

  it('does not treat proof as ABV', () => {
    expect(extractAbv('90 Proof')).toEqual([])
  })
})

describe('net contents extraction', () => {
  it.each([
    ['750 mL', 750],
    ['0.75 L', 750],
    ['25.36 fl. oz.', 749.9],
  ])('normalizes %s to milliliters', (text, expected) => {
    const actual = extractNetContents(text)[0]?.value
    expect(actual).toBeCloseTo(expected, 0)
  })

  it('rejects values without a recognized volume unit', () => {
    expect(parseExpectedNetContents('750')).toBeNull()
  })
})
