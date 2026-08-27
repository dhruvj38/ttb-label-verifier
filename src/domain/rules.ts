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
  key: 'brand' | 'classType' | 'nameAddress',
  label: string,
  expected: string,
  otherExpectedIdentities: string[],
  text: string,
): CheckResult {
  const evidence = findIdentityEvidence(text, expected, otherExpectedIdentities)

  if (evidence.similarity === 1 && evidence.ambiguousContinuation) {
    return {
      key,
      label,
      status: 'review',
      expected,
      observed: evidence.text,
      reason:
        'An OCR line group matches, but adjacent text may continue the identity. Review the complete label name.',
    }
  }

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

function countryOfOriginCheck(
  values: ApplicationValues,
  text: string,
): CheckResult {
  if (values.productOrigin === 'domestic') {
    return {
      key: 'countryOfOrigin',
      label: 'Country of origin',
      status: 'pass',
      expected: 'Not required — domestic product',
      observed: 'Application identifies this product as domestic.',
      reason:
        'Country of origin is required for imported distilled spirits only.',
    }
  }

  const expected = values.countryOfOrigin.trim()
  const candidates = [
    expected,
    `Product of ${expected}`,
    `Produced in ${expected}`,
    `Made in ${expected}`,
  ]
    .map((candidate) => findIdentityEvidence(text, candidate))
    .sort((left, right) => right.similarity - left.similarity)
  const evidence = candidates[0]!

  if (evidence.similarity === 1 && !evidence.ambiguousContinuation) {
    return {
      key: 'countryOfOrigin',
      label: 'Country of origin',
      status: 'pass',
      expected,
      observed: evidence.text,
      reason: 'A complete country-of-origin statement matches the application.',
    }
  }
  if (evidence.similarity >= 0.78) {
    return {
      key: 'countryOfOrigin',
      label: 'Country of origin',
      status: 'review',
      expected,
      observed: evidence.text,
      reason: `The closest complete origin statement is similar (${Math.round(evidence.similarity * 100)}%) but needs human review.`,
    }
  }
  return {
    key: 'countryOfOrigin',
    label: 'Country of origin',
    status: 'mismatch',
    expected,
    observed: evidence.text,
    reason: 'No complete country-of-origin statement matches the application.',
  }
}

function numericCheck(
  key: 'abv' | 'netContents',
  label: string,
  expectedDisplay: string,
  expected: number | null,
  evidence: ReturnType<typeof extractAbv>,
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
  const malformed = evidence.filter((candidate) => candidate.malformed)
  if (malformed.length > 0) {
    return {
      key,
      label,
      status: 'review',
      expected: expectedDisplay,
      observed: evidence.map((item) => item.raw).join(', '),
      reason:
        'OCR found a numeric-looking value with unsupported punctuation or sign. Review the label value manually.',
    }
  }
  const declarations = evidence.reduce<Array<(typeof evidence)[number][]>>(
    (groups, candidate) => {
      const equivalent = groups.find((group) =>
        numericallyEqual(group[0]!.value, candidate.value),
      )
      if (equivalent) equivalent.push(candidate)
      else groups.push([candidate])
      return groups
    },
    [],
  )
  if (declarations.length > 1) {
    return {
      key,
      label,
      status: 'review',
      expected: expectedDisplay,
      observed: evidence.map((item) => item.raw).join(', '),
      reason:
        'The label contains conflicting declarations for this value. Review every declaration manually.',
    }
  }
  if (numericallyEqual(declarations[0]![0]!.value, expected)) {
    return {
      key,
      label,
      status: 'pass',
      expected: expectedDisplay,
      observed: declarations[0]!.map((item) => item.raw).join(', '),
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

function numericallyEqual(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right))
  return Math.abs(left - right) <= Number.EPSILON * scale
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
  warningConfidence = confidence,
): CheckResult[] {
  const identities = [values.brand, values.classType, values.nameAddress]
  return [
    identityCheck(
      'brand',
      'Brand name',
      values.brand,
      identities.filter((identity) => identity !== values.brand),
      text,
    ),
    identityCheck(
      'classType',
      'Class / type',
      values.classType,
      identities.filter((identity) => identity !== values.classType),
      text,
    ),
    numericCheck(
      'abv',
      'Alcohol by volume',
      `${values.abv.replace(/\s*%$/, '')}%`,
      parseExpectedAbv(values.abv),
      extractAbv(text),
    ),
    numericCheck(
      'netContents',
      'Net contents',
      values.netContents,
      parseExpectedNetContents(values.netContents),
      extractNetContents(text),
    ),
    identityCheck(
      'nameAddress',
      'Name & address statement',
      values.nameAddress,
      identities.filter((identity) => identity !== values.nameAddress),
      text,
    ),
    countryOfOriginCheck(values, text),
    warningTextCheck(text, warningConfidence),
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

export function applyWarningFormatDecision(
  checks: CheckResult[],
  decision?: 'pass' | 'mismatch',
): CheckResult[] {
  return checks.map((check) => {
    if (check.key !== 'warningFormat') return check
    if (!decision) {
      return {
        ...check,
        status: 'review',
        observed: 'Inspect the label image',
        reason:
          'A photograph cannot establish bold weight, separation, contrast, or physical type size reliably.',
      }
    }
    return {
      ...check,
      status: decision,
      observed:
        decision === 'pass'
          ? 'Reviewer confirmed the required warning formatting from the label image.'
          : 'Reviewer flagged a warning-formatting problem on the label image.',
      reason:
        decision === 'pass'
          ? 'Manual reviewer decision: compliant. This records a human inspection; OCR did not verify physical type size or boldness.'
          : 'Manual reviewer decision: formatting problem found. OCR did not determine this result.',
    }
  })
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
