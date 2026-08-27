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
