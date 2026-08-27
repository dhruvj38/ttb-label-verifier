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

  it('marks an exact single-line fragment with matching adjacent context', () => {
    const evidence = findIdentityEvidence(
      'OLD TOM\nDISTILLERY\nKentucky Straight\nBourbon Whiskey',
      'OLD TOM',
    )
    expect(evidence.similarity).toBe(1)
    expect(evidence.text).toBe('OLD TOM\nDISTILLERY')
    expect(evidence.ambiguousContinuation).toBe(true)
  })

  it('returns zero when either side is empty', () => {
    expect(levenshteinSimilarity('', 'label')).toBe(0)
  })
})
