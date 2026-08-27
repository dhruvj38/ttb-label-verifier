import { describe, expect, it } from 'vitest'
import {
  extractAbv,
  extractNetContents,
  parseExpectedAbv,
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

  it.each(['1,45% Alc./Vol.', '.45% Alc./Vol.', '-45% Alc./Vol.'])(
    'keeps malformed OCR ABV token %j from becoming a valid suffix',
    (text) => {
      const evidence = extractAbv(text)
      expect(evidence).toEqual([
        expect.objectContaining({ raw: text, malformed: true }),
      ])
      expect(evidence.some((item) => item.value === 45)).toBe(false)
    },
  )

  it('extracts valid ABV beside ordinary label text', () => {
    const evidence = extractAbv('Bottled at 45.5% Alc./Vol. in Kentucky')
    expect(evidence).toEqual([expect.objectContaining({ value: 45.5 })])
    expect(evidence[0]).not.toHaveProperty('malformed')
  })

  it.each([
    '450',
    '450%',
    '45abc',
    '45%%',
    '-1',
    'NaN',
    'Infinity',
    '1e309',
    '',
  ])('rejects invalid application ABV %j', (value) => {
    expect(parseExpectedAbv(value)).toBeNull()
  })

  it.each([
    ['45', 45],
    ['45%', 45],
    [' 45.5 % ', 45.5],
    ['1e2', 100],
    ['0', 0],
  ])('accepts complete in-range application ABV %j', (value, expected) => {
    expect(parseExpectedAbv(value)).toBe(expected)
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

  it.each(['1,750 mL', '.750 mL', '-750 mL'])(
    'keeps malformed OCR volume token %j from becoming a valid suffix',
    (text) => {
      const evidence = extractNetContents(text)
      expect(evidence).toEqual([
        expect.objectContaining({ raw: text, malformed: true }),
      ])
      expect(evidence.some((item) => item.value === 750)).toBe(false)
    },
  )

  it('extracts valid volume beside ordinary label text', () => {
    const evidence = extractNetContents(
      'Net contents: 750.5 mL — bottled locally',
    )
    expect(evidence).toEqual([expect.objectContaining({ value: 750.5 })])
    expect(evidence[0]).not.toHaveProperty('malformed')
  })

  it.each([
    'garbage 750 mL',
    '750 mL garbage',
    '750..5 mL',
    '750 mLs',
    '0 mL',
    '-750 mL',
    'Infinity L',
    '',
  ])('rejects invalid application net contents %j', (value) => {
    expect(parseExpectedNetContents(value)).toBeNull()
  })

  it.each([
    ['750 mL', 750],
    [' 0.75 L ', 750],
    ['25.36 fl. oz.', 749.9],
    ['700 millilitres', 700],
    ['1 liter', 1000],
  ])('accepts complete positive application volume %j', (value, expected) => {
    expect(parseExpectedNetContents(value)).toBeCloseTo(expected, 0)
  })
})
