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

  it('returns zero when either side is empty', () => {
    expect(levenshteinSimilarity('', 'label')).toBe(0)
  })
})
