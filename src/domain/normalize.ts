const APOSTROPHES = /[\u2018\u2019\u02bc\u2032]/g

export function normalizeIdentity(value: string): string {
  return value
    .normalize('NFKC')
    .replace(APOSTROPHES, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US')
}

export function normalizeWarningLayout(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

export function levenshteinSimilarity(left: string, right: string): number {
  if (left === right) return 1
  if (left.length === 0 || right.length === 0) return 0

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  const current = new Array<number>(right.length + 1)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution =
        previous[rightIndex - 1]! +
        (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      current[rightIndex] = Math.min(
        previous[rightIndex]! + 1,
        current[rightIndex - 1]! + 1,
        substitution,
      )
    }
    previous.splice(0, previous.length, ...current)
  }

  return 1 - previous[right.length]! / Math.max(left.length, right.length)
}

export interface IdentityEvidence {
  text: string
  similarity: number
  ambiguousContinuation: boolean
}

type LineCase = 'upper' | 'lower' | 'title' | 'mixed' | 'none'

function lineCase(value: string): LineCase {
  const words = value.match(/\p{L}+/gu) ?? []
  if (words.length === 0) return 'none'
  const letters = words.join('')
  if (letters === letters.toLocaleUpperCase('en-US')) return 'upper'
  if (letters === letters.toLocaleLowerCase('en-US')) return 'lower'
  if (
    words.every(
      (word) =>
        word[0] === word[0]?.toLocaleUpperCase('en-US') &&
        word.slice(1) === word.slice(1).toLocaleLowerCase('en-US'),
    )
  )
    return 'title'
  return 'mixed'
}

function plausiblyContinues(anchor: string, adjacent: string): boolean {
  if (/\d/.test(adjacent)) return false
  const anchorCase = lineCase(anchor)
  if (
    anchorCase === 'none' ||
    anchorCase === 'mixed' ||
    lineCase(adjacent) !== anchorCase
  )
    return false

  const normalizedAnchor = normalizeIdentity(anchor)
  const normalizedAdjacent = normalizeIdentity(adjacent)
  const anchorWords = normalizedAnchor.split(' ').length
  const adjacentWords = normalizedAdjacent.split(' ').length
  return (
    adjacentWords <= Math.max(anchorWords + 1, 3) &&
    normalizedAdjacent.length <= Math.max(normalizedAnchor.length * 1.6, 16)
  )
}

export function findIdentityEvidence(
  text: string,
  expected: string,
): IdentityEvidence {
  const normalizedExpected = normalizeIdentity(expected)
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  let closest: IdentityEvidence = {
    text: 'Not found',
    similarity: 0,
    ambiguousContinuation: false,
  }
  const maximumLines = Math.min(4, lines.length)

  for (let lineCount = 1; lineCount <= maximumLines; lineCount += 1) {
    for (let start = 0; start + lineCount <= lines.length; start += 1) {
      const evidenceLines = lines.slice(start, start + lineCount)
      const similarity = levenshteinSimilarity(
        normalizeIdentity(evidenceLines.join(' ')),
        normalizedExpected,
      )
      const previousContinues =
        lineCount === 1 &&
        similarity === 1 &&
        start > 0 &&
        plausiblyContinues(evidenceLines[0]!, lines[start - 1]!)
      const nextContinues =
        lineCount === 1 &&
        similarity === 1 &&
        start + 1 < lines.length &&
        plausiblyContinues(evidenceLines[0]!, lines[start + 1]!)
      const ambiguousContinuation =
        similarity === 1 && (previousContinues || nextContinues)
      const contextStart = previousContinues ? start - 1 : start
      const contextEnd = nextContinues ? start + 2 : start + lineCount
      const candidate: IdentityEvidence = {
        text: lines.slice(contextStart, contextEnd).join('\n'),
        similarity,
        ambiguousContinuation,
      }
      if (
        candidate.similarity > closest.similarity ||
        (candidate.similarity === closest.similarity &&
          closest.ambiguousContinuation &&
          !candidate.ambiguousContinuation)
      ) {
        closest = candidate
      }
    }
  }
  return closest
}
