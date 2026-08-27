import { describe, expect, it } from 'vitest'
import {
  findIdentityEvidence,
  levenshteinSimilarity,
  normalizeIdentity,
} from '../../src/domain/normalize'

describe('identity normalization', () => {
  it('normalizes case, whitespace, unicode, and typographic apostrophes', () => {
    expect(normalizeIdentity('  STONE\u2019S   THROW  ')).toBe("stone's throw")
  })

  it('does not discard or reorder words', () => {
    expect(normalizeIdentity('Old Tom Distillery')).not.toBe(
      normalizeIdentity('Tom Old Distillery'),
    )
  })
})

describe('similarity helpers', () => {
  it('finds the closest line without treating a near match as exact', () => {
    const closest = findIdentityEvidence(
      'SMALL BATCH\nOLD TON DISTILLERY\nKENTUCKY',
      'Old Tom Distillery',
    )
    expect(closest.text).toBe('OLD TON DISTILLERY')
    expect(closest.similarity).toBeGreaterThan(0.9)
    expect(closest.similarity).toBeLessThan(1)
  })

  it('combines adjacent OCR lines as complete supporting evidence', () => {
    const evidence = findIdentityEvidence(
      'OLD TOM DISTILLERY\nKentucky Straight\nBourbon Whiskey\n45% Alc./Vol.',
      'Kentucky Straight Bourbon Whiskey',
      ['OLD TOM DISTILLERY'],
    )
    expect(evidence.similarity).toBe(1)
    expect(evidence.text).toBe('Kentucky Straight\nBourbon Whiskey')
    expect(evidence.ambiguousContinuation).toBe(false)
  })

  it.each([
    ['OLD TOM', 'DISTILLERY'],
    ['Old Tom', 'DISTILLERY'],
    ['OLD TOM', '1792 DISTILLERY'],
    ['OLD TOM', 'THE OLD DISTILLERY COMPANY'],
  ])(
    'marks exact fragment %j as ambiguous before adjacent %j',
    (fragment, continuation) => {
      const evidence = findIdentityEvidence(
        `${fragment}\n${continuation}`,
        fragment,
      )
      expect(evidence.similarity).toBe(1)
      expect(evidence.text).toBe(`${fragment}\n${continuation}`)
      expect(evidence.ambiguousContinuation).toBe(true)
    },
  )

  it.each([
    [['OLD', 'TOM', 'DISTILLERY'], 'TOM DISTILLERY'],
    [['KENTUCKY', 'STRAIGHT', 'BOURBON WHISKEY'], 'STRAIGHT BOURBON WHISKEY'],
    [['1792 DISTILLERY', 'Old', 'Tom'], 'Old Tom'],
    [['THE OLD DISTILLERY COMPANY', 'OLD', 'TOM'], 'OLD TOM'],
  ])('marks exact suffix span %j as ambiguous for %j', (lines, expected) => {
    const evidence = findIdentityEvidence(lines.join('\n'), expected)
    expect(evidence.similarity).toBe(1)
    expect(evidence.text).toBe(lines.join('\n'))
    expect(evidence.ambiguousContinuation).toBe(true)
  })

  it('marks a middle exact span ambiguous on both boundaries', () => {
    const evidence = findIdentityEvidence(
      'THE OLD\nTOM\nDISTILLERY COMPANY',
      'TOM',
    )
    expect(evidence.similarity).toBe(1)
    expect(evidence.text).toBe('THE OLD\nTOM\nDISTILLERY COMPANY')
    expect(evidence.ambiguousContinuation).toBe(true)
  })

  it.each([
    [['OLD', 'TOM', 'DISTILLERY'], 'OLD TOM'],
    [['Kentucky', 'Straight', 'Bourbon Whiskey'], 'Kentucky Straight'],
    [['Old', 'Tom', '1792 DISTILLERY'], 'Old Tom'],
    [['OLD', 'TOM', 'THE OLD DISTILLERY COMPANY'], 'OLD TOM'],
  ])(
    'marks exact multi-line fragment %j as ambiguous for %j',
    (lines, expected) => {
      const evidence = findIdentityEvidence(lines.join('\n'), expected)
      expect(evidence.similarity).toBe(1)
      expect(evidence.text).toBe(lines.join('\n'))
      expect(evidence.ambiguousContinuation).toBe(true)
    },
  )

  it('does not manufacture an exact span across a known separate identity', () => {
    const evidence = findIdentityEvidence(
      'OLD TOM\nKentucky Straight Bourbon Whiskey\nDISTILLERY',
      'OLD TOM Kentucky Straight Bourbon Whiskey DISTILLERY',
      ['Kentucky Straight Bourbon Whiskey'],
    )
    expect(evidence.similarity).toBeLessThan(1)
  })

  it('passes complete multi-line identities between hard boundaries', () => {
    const brand = findIdentityEvidence(
      '750 mL\nOLD\nTOM\nKentucky\nStraight Bourbon Whiskey\n45% Alc./Vol.',
      'OLD TOM',
      ['Kentucky Straight Bourbon Whiskey'],
    )
    expect(brand).toEqual({
      text: 'OLD\nTOM',
      similarity: 1,
      ambiguousContinuation: false,
    })

    const classType = findIdentityEvidence(
      'GOVERNMENT WARNING: required statement\nOLD TOM\nKentucky\nStraight Bourbon Whiskey\n750 millilitres',
      'Kentucky Straight Bourbon Whiskey',
      ['OLD TOM'],
    )
    expect(classType).toEqual({
      text: 'Kentucky\nStraight Bourbon Whiskey',
      similarity: 1,
      ambiguousContinuation: false,
    })
  })

  it('does not treat a separately supplied identity as a continuation', () => {
    const evidence = findIdentityEvidence(
      "STONE'S THROW\nKentucky Straight Bourbon Whiskey\n45% Alc./Vol.",
      "STONE'S THROW",
      ['Kentucky Straight Bourbon Whiskey'],
    )
    expect(evidence.similarity).toBe(1)
    expect(evidence.text).toBe("STONE'S THROW")
    expect(evidence.ambiguousContinuation).toBe(false)
  })

  it.each([
    ['OLD\nTOM\n45% Alc./Vol.', []],
    ['OLD\nTOM\n750 mL', []],
    ['OLD\nTOM\nGOVERNMENT WARNING: required statement', []],
    [
      'OLD\nTOM\nKentucky\nStraight\nBourbon Whiskey',
      ['Kentucky Straight Bourbon Whiskey'],
    ],
  ])(
    'does not make complete multi-line evidence ambiguous before a separate field in %j',
    (text, knownSeparateIdentities) => {
      const evidence = findIdentityEvidence(
        text,
        'OLD TOM',
        knownSeparateIdentities,
      )
      expect(evidence.similarity).toBe(1)
      expect(evidence.text).toBe('OLD\nTOM')
      expect(evidence.ambiguousContinuation).toBe(false)
    },
  )

  it('returns zero when either side is empty', () => {
    expect(levenshteinSimilarity('', 'label')).toBe(0)
  })
})
