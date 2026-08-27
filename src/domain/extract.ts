export interface NumericEvidence {
  value: number
  raw: string
}

function uniqueEvidence(values: NumericEvidence[]): NumericEvidence[] {
  return values.filter(
    (candidate, index) =>
      values.findIndex(
        (item) => item.value === candidate.value && item.raw === candidate.raw,
      ) === index,
  )
}

export function extractAbv(text: string): NumericEvidence[] {
  const results: NumericEvidence[] = []
  const patterns = [
    /\b(\d{1,2}(?:\.\d+)?)\s*%\s*(?:alc(?:ohol)?\.?\s*(?:\/?\s*(?:by\s*)?vol(?:ume)?\.?)?)/gi,
    /\b(?:alc(?:ohol)?\.?\s*(?:by\s*)?vol(?:ume)?\.?)\s*(?::|-)?\s*(\d{1,2}(?:\.\d+)?)\s*%/gi,
  ]

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = Number(match[1])
      if (Number.isFinite(value) && value >= 0 && value <= 100) {
        results.push({ value, raw: match[0].trim() })
      }
    }
  }
  return uniqueEvidence(results)
}

export function parseExpectedAbv(value: string): number | null {
  const match = value.match(/\d{1,2}(?:\.\d+)?/)
  if (!match) return null
  const result = Number(match[0])
  return Number.isFinite(result) && result >= 0 && result <= 100 ? result : null
}

export function extractNetContents(text: string): NumericEvidence[] {
  const results: NumericEvidence[] = []
  const pattern =
    /\b(\d+(?:\.\d+)?)\s*(m\s*l|millilit(?:er|re)s?|l(?:iter|itre)?s?|fl\.?\s*oz\.?)\b/gi

  for (const match of text.matchAll(pattern)) {
    const amount = Number(match[1])
    const unit = match[2]!.replace(/[\s.]/g, '').toLowerCase()
    let milliliters = amount
    if (unit === 'l' || unit.startsWith('liter') || unit.startsWith('litre')) {
      milliliters = amount * 1000
    } else if (unit === 'floz') {
      milliliters = amount * 29.5735
    }
    if (Number.isFinite(milliliters)) {
      results.push({ value: milliliters, raw: match[0].trim() })
    }
  }
  return uniqueEvidence(results)
}

export function parseExpectedNetContents(value: string): number | null {
  return extractNetContents(value)[0]?.value ?? null
}

export function extractWarningEvidence(text: string): string {
  const prefix = /government\s+warning\s*:/i.exec(text)
  if (prefix?.index === undefined) return 'Not found'
  return text
    .slice(prefix.index, prefix.index + 360)
    .replace(/\s+/g, ' ')
    .trim()
}
