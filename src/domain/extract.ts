export interface NumericEvidence {
  value: number
  raw: string
}

const NET_CONTENTS_NUMBER = '(\\d+(?:\\.\\d+)?)'
const NET_CONTENTS_UNIT =
  '(m\\s*l|millilit(?:er|re)s?|l(?:iter|itre)?s?|fl\\.?\\s*oz\\.?)'

function toMilliliters(amount: number, rawUnit: string): number {
  const unit = rawUnit.replace(/[\s.]/g, '').toLowerCase()
  if (unit === 'l' || unit.startsWith('liter') || unit.startsWith('litre')) {
    return amount * 1000
  }
  if (unit === 'floz') return amount * 29.5735
  return amount
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
  const match = value.match(
    /^\s*([+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:e[+-]?\d+)?)\s*%?\s*$/i,
  )
  if (!match) return null
  const result = Number(match[1])
  return Number.isFinite(result) && result >= 0 && result <= 100 ? result : null
}

export function extractNetContents(text: string): NumericEvidence[] {
  const results: NumericEvidence[] = []
  const pattern = new RegExp(
    `\\b${NET_CONTENTS_NUMBER}\\s*${NET_CONTENTS_UNIT}\\b`,
    'gi',
  )

  for (const match of text.matchAll(pattern)) {
    const amount = Number(match[1])
    const milliliters = toMilliliters(amount, match[2]!)
    if (Number.isFinite(milliliters)) {
      results.push({ value: milliliters, raw: match[0].trim() })
    }
  }
  return uniqueEvidence(results)
}

export function parseExpectedNetContents(value: string): number | null {
  const match = value.match(
    new RegExp(`^\\s*${NET_CONTENTS_NUMBER}\\s*${NET_CONTENTS_UNIT}\\s*$`, 'i'),
  )
  if (!match) return null

  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount <= 0) return null

  return toMilliliters(amount, match[2]!)
}

export function extractWarningEvidence(text: string): string {
  const prefix = /government\s+warning\s*:/i.exec(text)
  if (prefix?.index === undefined) return 'Not found'
  return text
    .slice(prefix.index, prefix.index + 360)
    .replace(/\s+/g, ' ')
    .trim()
}
