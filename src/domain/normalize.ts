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

  let closest: IdentityEvidence = { text: 'Not found', similarity: 0 }
  const maximumLines = Math.min(4, lines.length)

  for (let lineCount = 1; lineCount <= maximumLines; lineCount += 1) {
    for (let start = 0; start + lineCount <= lines.length; start += 1) {
      const evidenceLines = lines.slice(start, start + lineCount)
      const similarity = levenshteinSimilarity(
        normalizeIdentity(evidenceLines.join(' ')),
        normalizedExpected,
      )
      if (similarity > closest.similarity) {
        closest = { text: evidenceLines.join('\n'), similarity }
      }
    }
  }
  return closest
}
