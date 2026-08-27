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

function knownIdentityLines(
  lines: string[],
  knownSeparateIdentities: string[],
): Set<number> {
  const indices = new Set<number>()
  for (const identity of knownSeparateIdentities) {
    const normalizedIdentity = normalizeIdentity(identity)
    for (let count = 1; count <= Math.min(4, lines.length); count += 1) {
      for (let start = 0; start + count <= lines.length; start += 1) {
        if (
          normalizeIdentity(lines.slice(start, start + count).join(' ')) ===
          normalizedIdentity
        ) {
          for (let index = start; index < start + count; index += 1) {
            indices.add(index)
          }
        }
      }
    }
  }
  return indices
}

function plausiblyContinues(value: string) {
  if (!/\p{L}/u.test(value)) return false
  if (/%/.test(value) || /^\s*government\s+warning\s*:/i.test(value)) {
    return false
  }
  if (
    /^\s*(?:bottled|distilled|produced|manufactured|processed|imported|packed|filled)\s+(?:by|for)\b/i.test(
      value,
    )
  ) {
    return false
  }
  return !/^\s*\d+(?:\.\d+)?\s*(?:m\s*l|millilit(?:er|re)s?|l(?:iter|itre)?s?|fl\.?\s*oz\.?)\s*$/i.test(
    value,
  )
}

export function findIdentityEvidence(
  text: string,
  expected: string,
  knownSeparateIdentities: string[] = [],
): IdentityEvidence {
  const normalizedExpected = normalizeIdentity(expected)
  const expectedIsNameAddress =
    /^(?:bottled|distilled|produced|manufactured|processed|imported|packed|filled)\s+(?:by|for)\b/.test(
      normalizedExpected,
    )
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const knownSeparateLines = knownIdentityLines(lines, knownSeparateIdentities)

  let closest: IdentityEvidence = {
    text: 'Not found',
    similarity: 0,
    ambiguousContinuation: false,
  }
  const maximumLines = Math.min(4, lines.length)

  for (let lineCount = 1; lineCount <= maximumLines; lineCount += 1) {
    for (let start = 0; start + lineCount <= lines.length; start += 1) {
      if (
        lines
          .slice(start, start + lineCount)
          .some((_, offset) => knownSeparateLines.has(start + offset))
      ) {
        continue
      }
      const evidenceLines = lines.slice(start, start + lineCount)
      const similarity = levenshteinSimilarity(
        normalizeIdentity(evidenceLines.join(' ')),
        normalizedExpected,
      )
      const nextContinues =
        similarity === 1 &&
        start + lineCount < lines.length &&
        plausiblyContinues(lines[start + lineCount]!)
      const previousContinues =
        similarity === 1 &&
        !expectedIsNameAddress &&
        start > 0 &&
        plausiblyContinues(lines[start - 1]!)
      const ambiguousContinuation =
        similarity === 1 && (previousContinues || nextContinues)
      const contextStart = previousContinues ? start - 1 : start
      const contextEnd = nextContinues
        ? start + lineCount + 1
        : start + lineCount
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
