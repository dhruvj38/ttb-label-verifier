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
45% Alc./Vol. (90 Proof)
STONE'S THROW
750 mL
Kentucky Straight Bourbon Whiskey
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

  it('does not pass an application identity that is only a label substring', () => {
    const checks = evaluateLabel({ ...expected, brand: 'THROW' }, validText, 94)
    expect(checks.find((check) => check.key === 'brand')?.status).not.toBe(
      'pass',
    )
  })

  it('passes a complete identity split across adjacent lines and shows both', () => {
    const check = evaluateLabel(
      expected,
      validText.replace(
        'Kentucky Straight Bourbon Whiskey',
        'Kentucky Straight\nBourbon Whiskey',
      ),
      94,
    ).find((item) => item.key === 'classType')
    expect(check?.status).toBe('pass')
    expect(check?.observed).toBe('Kentucky Straight\nBourbon Whiskey')
  })

  it('does not pass an exact brand line when adjacent text plausibly continues it', () => {
    const splitText = validText.replace("STONE'S THROW", 'OLD TOM\nDISTILLERY')
    const fragment = evaluateLabel(
      { ...expected, brand: 'OLD TOM' },
      splitText,
      94,
    ).find((item) => item.key === 'brand')
    expect(fragment?.status).toBe('review')
    expect(fragment?.observed).toBe('OLD TOM\nDISTILLERY')

    const full = evaluateLabel(
      { ...expected, brand: 'OLD TOM DISTILLERY' },
      splitText,
      94,
    ).find((item) => item.key === 'brand')
    expect(full?.status).toBe('pass')
    expect(full?.observed).toBe('OLD TOM\nDISTILLERY')
  })

  it.each([
    ['OLD TOM', '1792 DISTILLERY'],
    ['Old Tom', 'DISTILLERY'],
    ['OLD TOM', 'THE OLD DISTILLERY COMPANY'],
  ])(
    'reviews fragment %j before presentation-independent continuation %j',
    (brand, continuation) => {
      const splitText = validText.replace(
        "STONE'S THROW",
        `${brand}\n${continuation}`,
      )
      const fragment = evaluateLabel(
        { ...expected, brand },
        splitText,
        94,
      ).find((item) => item.key === 'brand')
      expect(fragment?.status).toBe('review')
      expect(fragment?.observed).toBe(`${brand}\n${continuation}`)

      const full = evaluateLabel(
        { ...expected, brand: `${brand} ${continuation}` },
        splitText,
        94,
      ).find((item) => item.key === 'brand')
      expect(full?.status).toBe('pass')
      expect(full?.observed).toBe(`${brand}\n${continuation}`)
    },
  )

  it.each([
    [['OLD', 'TOM', 'DISTILLERY'], 'OLD TOM', 'OLD TOM DISTILLERY'],
    [['Old', 'Tom', '1792 DISTILLERY'], 'Old Tom', 'Old Tom 1792 DISTILLERY'],
    [
      ['OLD', 'TOM', 'THE OLD DISTILLERY COMPANY'],
      'OLD TOM',
      'OLD TOM THE OLD DISTILLERY COMPANY',
    ],
  ])(
    'reviews multi-line fragment %j and passes complete value %j',
    (lines, fragmentBrand, fullBrand) => {
      const splitText = validText.replace("STONE'S THROW", lines.join('\n'))
      const fragment = evaluateLabel(
        { ...expected, brand: fragmentBrand },
        splitText,
        94,
      ).find((item) => item.key === 'brand')
      expect(fragment?.status).toBe('review')
      expect(fragment?.observed).toBe(lines.join('\n'))

      const full = evaluateLabel(
        { ...expected, brand: fullBrand },
        splitText,
        94,
      ).find((item) => item.key === 'brand')
      expect(full?.status).toBe('pass')
      expect(full?.observed).toBe(lines.join('\n'))
    },
  )

  it('reviews a multi-line class fragment and passes its complete group', () => {
    const lines = ['Kentucky', 'Straight', 'Bourbon Whiskey']
    const splitText = validText.replace(
      'Kentucky Straight Bourbon Whiskey',
      lines.join('\n'),
    )
    const fragment = evaluateLabel(
      { ...expected, classType: 'Kentucky Straight' },
      splitText,
      94,
    ).find((item) => item.key === 'classType')
    expect(fragment?.status).toBe('review')
    expect(fragment?.observed).toBe(lines.join('\n'))

    const full = evaluateLabel(expected, splitText, 94).find(
      (item) => item.key === 'classType',
    )
    expect(full?.status).toBe('pass')
    expect(full?.observed).toBe(lines.join('\n'))
  })

  it('reviews multi-line suffix fragments and passes complete identities', () => {
    const text = validText
      .replace("STONE'S THROW", 'OLD\nTOM\nDISTILLERY')
      .replace(
        'Kentucky Straight Bourbon Whiskey',
        'KENTUCKY\nSTRAIGHT\nBOURBON WHISKEY',
      )
    const fragments = evaluateLabel(
      {
        ...expected,
        brand: 'TOM DISTILLERY',
        classType: 'STRAIGHT BOURBON WHISKEY',
      },
      text,
      94,
    )
    expect(fragments.find((item) => item.key === 'brand')?.status).toBe(
      'review',
    )
    expect(fragments.find((item) => item.key === 'classType')?.status).toBe(
      'review',
    )

    const full = evaluateLabel(
      {
        ...expected,
        brand: 'OLD TOM DISTILLERY',
        classType: 'KENTUCKY STRAIGHT BOURBON WHISKEY',
      },
      text,
      94,
    )
    expect(full.find((item) => item.key === 'brand')?.status).toBe('pass')
    expect(full.find((item) => item.key === 'classType')?.status).toBe('pass')
  })

  it('does not join candidate text across the separately submitted identity', () => {
    const text = `
45% Alc./Vol. (90 Proof)
OLD TOM
Kentucky Straight Bourbon Whiskey
DISTILLERY
750 mL
${GOVERNMENT_WARNING}
`
    const brand = evaluateLabel(
      {
        ...expected,
        brand: 'OLD TOM Kentucky Straight Bourbon Whiskey DISTILLERY',
      },
      text,
      94,
    ).find((item) => item.key === 'brand')
    expect(brand?.status).not.toBe('pass')
  })

  it('keeps directly adjacent submitted identities in review', () => {
    const text = `
OLD TOM
BOURBON WHISKEY
45% Alc./Vol.
750 mL
${GOVERNMENT_WARNING}
`
    const checks = evaluateLabel(
      {
        brand: 'OLD TOM',
        classType: 'BOURBON WHISKEY',
        abv: '45',
        netContents: '750 mL',
      },
      text,
      94,
    )
    expect(checks.find((item) => item.key === 'brand')?.status).toBe('review')
    expect(checks.find((item) => item.key === 'classType')?.status).toBe(
      'review',
    )
  })

  it('does not pass an exact class line when adjacent text plausibly continues it', () => {
    const splitText = validText.replace(
      'Kentucky Straight Bourbon Whiskey',
      'Kentucky Straight\nBourbon Whiskey',
    )
    const fragment = evaluateLabel(
      { ...expected, classType: 'Kentucky Straight' },
      splitText,
      94,
    ).find((item) => item.key === 'classType')
    expect(fragment?.status).toBe('review')
    expect(fragment?.observed).toBe('Kentucky Straight\nBourbon Whiskey')

    const full = evaluateLabel(expected, splitText, 94).find(
      (item) => item.key === 'classType',
    )
    expect(full?.status).toBe('pass')
    expect(full?.observed).toBe('Kentucky Straight\nBourbon Whiskey')
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

  it('reviews matching declarations alongside contradictory values', () => {
    const checks = evaluateLabel(
      expected,
      validText
        .replace('45% Alc./Vol. (90 Proof)', '45% Alc./Vol.\n40% Alc./Vol.')
        .replace('750 mL', '750 mL\n1 L'),
      94,
    )
    const abv = checks.find((check) => check.key === 'abv')
    const volume = checks.find((check) => check.key === 'netContents')
    expect(abv).toMatchObject({ status: 'review' })
    expect(abv?.observed).toContain('45% Alc./Vol.')
    expect(abv?.observed).toContain('40% Alc./Vol.')
    expect(volume).toMatchObject({ status: 'review' })
    expect(volume?.observed).toContain('750 mL')
    expect(volume?.observed).toContain('1 L')
  })

  it('reviews multiple contradictory nonmatching declarations', () => {
    const checks = evaluateLabel(
      expected,
      validText
        .replace('45% Alc./Vol. (90 Proof)', '40% Alc./Vol.\n42% Alc./Vol.')
        .replace('750 mL', '700 mL\n1 L'),
      94,
    )
    expect(checks.find((check) => check.key === 'abv')?.status).toBe('review')
    expect(checks.find((check) => check.key === 'netContents')?.status).toBe(
      'review',
    )
  })

  it('collapses duplicate and canonically equivalent declarations', () => {
    const checks = evaluateLabel(
      expected,
      validText
        .replace('45% Alc./Vol. (90 Proof)', '45% Alc./Vol.\n45% Alc./Vol.')
        .replace('750 mL', '750 mL\n0.75 L'),
      94,
    )
    expect(checks.find((check) => check.key === 'abv')?.status).toBe('pass')
    const volume = checks.find((check) => check.key === 'netContents')
    expect(volume?.status).toBe('pass')
    expect(volume?.observed).toContain('750 mL')
    expect(volume?.observed).toContain('0.75 L')
  })

  it('does not pass near-but-different declarations outside floating-point epsilon', () => {
    const checks = evaluateLabel(
      expected,
      validText
        .replace('45% Alc./Vol. (90 Proof)', '45.0001% Alc./Vol.')
        .replace('750 mL', '750.0001 mL'),
      94,
    )
    expect(checks.find((check) => check.key === 'abv')?.status).toBe('mismatch')
    expect(checks.find((check) => check.key === 'netContents')?.status).toBe(
      'mismatch',
    )
  })

  it('passes exact decimal declarations', () => {
    const checks = evaluateLabel(
      { ...expected, abv: '45.5', netContents: '750.5 mL' },
      validText
        .replace('45% Alc./Vol. (90 Proof)', '45.5% Alc./Vol.')
        .replace('750 mL', '750.5 mL'),
      94,
    )
    expect(checks.find((check) => check.key === 'abv')?.status).toBe('pass')
    expect(checks.find((check) => check.key === 'netContents')?.status).toBe(
      'pass',
    )
  })

  it.each([
    ['1,45% Alc./Vol.', '1,750 mL'],
    ['.45% Alc./Vol.', '.750 mL'],
    ['-45% Alc./Vol.', '-750 mL'],
  ])(
    'reviews malformed OCR numeric tokens %j and %j without passing suffixes',
    (abv, volume) => {
      const text = validText
        .replace('45% Alc./Vol. (90 Proof)', abv)
        .replace('750 mL', volume)
      const checks = evaluateLabel(expected, text, 94)
      expect(checks.find((item) => item.key === 'abv')?.status).toBe('review')
      expect(checks.find((item) => item.key === 'netContents')?.status).toBe(
        'review',
      )
    },
  )

  it('never passes malformed or out-of-range application ABV values', () => {
    for (const abv of ['450%', '45abc', 'Infinity']) {
      const check = evaluateLabel({ ...expected, abv }, validText, 94).find(
        (item) => item.key === 'abv',
      )
      expect(check?.status).toBe('review')
    }
  })

  it('never passes malformed application net contents', () => {
    for (const netContents of [
      'garbage 750 mL',
      '750 mL garbage',
      '750..5 mL',
      '750 mLs',
      '0 mL',
    ]) {
      const check = evaluateLabel(
        { ...expected, netContents },
        validText,
        94,
      ).find((item) => item.key === 'netContents')
      expect(check?.status).toBe('review')
    }
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
