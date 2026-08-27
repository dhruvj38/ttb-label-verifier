import {
  extractAbv,
  extractNetContents,
  extractWarningEvidence,
  parseExpectedAbv,
  parseExpectedNetContents,
} from './extract'
import {
  findIdentityEvidence,
  levenshteinSimilarity,
  normalizeWarningLayout,
} from './normalize'
import type { ApplicationValues, CheckResult, CheckStatus } from './types'
import { GOVERNMENT_WARNING } from './warning'

function identityCheck(
  key: 'brand' | 'classType',
  label: string,
  expected: string,
  text: string,
): CheckResult {
  const evidence = findIdentityEvidence(text, expected)

  if (evidence.similarity === 1) {
    return {
      key,
      label,
      status: 'pass',
      expected,
      observed: evidence.text,
      reason:
        'A complete OCR line or adjacent line group matches after normalizing case, spacing, and apostrophes.',
    }
  }

  if (evidence.similarity >= 0.78) {
    return {
      key,
      label,
      status: 'review',
      expected,
      observed: evidence.text,
      reason: `The closest complete text candidate is similar (${Math.round(evidence.similarity * 100)}%) but not an exact normalized match.`,
    }
  }

  return {
    key,
    label,
    status: 'mismatch',
    expected,
    observed: evidence.text,
    reason:
      'No complete OCR line or adjacent line group matches the application value.',
  }
}

function numericCheck(
  key: 'abv' | 'netContents',
  label: string,
  expectedDisplay: string,
  expected: number | null,
  evidence: ReturnType<typeof extractAbv>,
  tolerance: number,
): CheckResult {
  if (expected === null) {
    return {
      key,
      label,
      status: 'review',
      expected: expectedDisplay,
      observed: 'Not evaluated',
      reason: 'Enter a value with a recognized number and unit.',
    }
  }
  if (evidence.length === 0) {
    return {
      key,
      label,
      status: 'mismatch',
      expected: expectedDisplay,
      observed: 'Not found',
      reason: 'No recognized label value was found.',
    }
  }
  const match = evidence.find(
    (candidate) => Math.abs(candidate.value - expected) <= tolerance,
  )
  if (match) {
    return {
      key,
      label,
      status: 'pass',
      expected: expectedDisplay,
      observed: match.raw,
      reason: 'The extracted value matches the application value.',
    }
  }
  return {
    key,
    label,
    status: 'mismatch',
    expected: expectedDisplay,
    observed: evidence.map((item) => item.raw).join(', '),
    reason: 'The extracted value differs from the application value.',
  }
}

function warningTextCheck(text: string, confidence: number): CheckResult {
  const normalizedText = normalizeWarningLayout(text)
  const expected = normalizeWarningLayout(GOVERNMENT_WARNING)
  const observed = extractWarningEvidence(text)

  if (normalizedText.includes(expected)) {
    return {
      key: 'warningText',
      label: 'Government warning text',
      status: confidence >= 75 ? 'pass' : 'review',
      expected: GOVERNMENT_WARNING,
      observed,
      confidence,
      reason:
        confidence >= 75
          ? 'The complete statement, punctuation, and uppercase prefix match.'
          : 'The text appears exact, but OCR confidence is too low for an automatic pass.',
    }
  }

  const candidate =
    observed === 'Not found' ? '' : normalizeWarningLayout(observed)
  const similarity = candidate
    ? levenshteinSimilarity(candidate.slice(0, expected.length), expected)
    : 0

  return {
    key: 'warningText',
    label: 'Government warning text',
    status: similarity >= 0.82 ? 'review' : 'mismatch',
    expected: GOVERNMENT_WARNING,
    observed,
    confidence,
    reason:
      similarity >= 0.82
        ? `OCR found a near match (${Math.round(similarity * 100)}%). Compare it word-for-word.`
        : 'The complete, exact government warning was not found.',
  }
}

export function evaluateLabel(
  values: ApplicationValues,
  text: string,
  confidence: number,
): CheckResult[] {
  return [
    identityCheck('brand', 'Brand name', values.brand, text),
    identityCheck('classType', 'Class / type', values.classType, text),
    numericCheck(
      'abv',
      'Alcohol by volume',
      `${values.abv.replace(/\s*%$/, '')}%`,
      parseExpectedAbv(values.abv),
      extractAbv(text),
      0.05,
    ),
    numericCheck(
      'netContents',
      'Net contents',
      values.netContents,
      parseExpectedNetContents(values.netContents),
      extractNetContents(text),
      0.6,
    ),
    warningTextCheck(text, confidence),
    {
      key: 'warningFormat',
      label: 'Warning format',
      status: 'review',
      expected:
        'Uppercase, bold prefix; legible, separate text at the required physical size',
      observed: 'Inspect the label image',
      reason:
        'A photograph cannot establish bold weight, separation, contrast, or physical type size reliably.',
    },
  ]
}

export function overallStatus(checks: CheckResult[]): CheckStatus {
  if (checks.some((check) => check.status === 'mismatch')) return 'mismatch'
  if (checks.some((check) => check.status === 'review')) return 'review'
  return 'pass'
}

export function statusCounts(checks: CheckResult[]) {
  return checks.reduce(
    (counts, check) => ({
      ...counts,
      [check.status]: counts[check.status] + 1,
    }),
    { pass: 0, mismatch: 0, review: 0 } satisfies Record<CheckStatus, number>,
  )
}
