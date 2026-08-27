import { describe, expect, it } from 'vitest'
import { evaluateLabel, overallStatus } from '../../src/domain/rules'
import { GOVERNMENT_WARNING } from '../../src/domain/warning'
import type { ApplicationValues } from '../../src/domain/types'

const expected: ApplicationValues = {
  brand: "Stone's Throw",
  classType: 'Kentucky Straight Bourbon Whiskey',
  abv: '45',
  netContents: '750 mL',
}

const validText = `
STONE'S THROW
Kentucky Straight Bourbon Whiskey
45% Alc./Vol. (90 Proof)
750 mL
${GOVERNMENT_WARNING}
`

describe('label rules', () => {
  it('passes capitalization-only identity differences and exact values', () => {
    const checks = evaluateLabel(expected, validText, 94)
    expect(checks.find((check) => check.key === 'brand')?.status).toBe('pass')
    expect(checks.find((check) => check.key === 'classType')?.status).toBe(
      'pass',
    )
    expect(checks.find((check) => check.key === 'abv')?.status).toBe('pass')
    expect(checks.find((check) => check.key === 'netContents')?.status).toBe(
      'pass',
    )
    expect(checks.find((check) => check.key === 'warningText')?.status).toBe(
      'pass',
    )
  })

  it('routes fuzzy identity text to review instead of passing it', () => {
    const checks = evaluateLabel(
      expected,
      validText.replace("STONE'S", 'STONES'),
      94,
    )
    expect(checks.find((check) => check.key === 'brand')?.status).toBe('review')
  })

  it('reports conflicting ABV and net contents as mismatches', () => {
    const checks = evaluateLabel(
      expected,
      validText
        .replace('45% Alc./Vol.', '40% Alc./Vol.')
        .replace('750 mL', '1 L'),
      94,
    )
    expect(checks.find((check) => check.key === 'abv')?.status).toBe('mismatch')
    expect(checks.find((check) => check.key === 'netContents')?.status).toBe(
      'mismatch',
    )
  })

  it('allows line-break whitespace but not title-case warning prefix to pass', () => {
    const whitespaceText = validText.replaceAll(' ', ' \n ')
    const whitespaceCheck = evaluateLabel(expected, whitespaceText, 94).find(
      (check) => check.key === 'warningText',
    )
    expect(whitespaceCheck?.status).toBe('pass')

    const titleCase = validText.replace(
      'GOVERNMENT WARNING:',
      'Government Warning:',
    )
    const caseCheck = evaluateLabel(expected, titleCase, 94).find(
      (check) => check.key === 'warningText',
    )
    expect(caseCheck?.status).not.toBe('pass')
  })

  it('never returns an overall pass while format needs manual review', () => {
    const checks = evaluateLabel(expected, validText, 94)
    expect(checks.find((check) => check.key === 'warningFormat')?.status).toBe(
      'review',
    )
    expect(overallStatus(checks)).toBe('review')
  })

  it('routes exact low-confidence OCR to review', () => {
    const check = evaluateLabel(expected, validText, 61).find(
      (item) => item.key === 'warningText',
    )
    expect(check?.status).toBe('review')
  })
})
