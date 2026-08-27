import type {
  CheckResult as CheckResultType,
  WarningFormatDecision,
} from '../domain/types'
import { StatusBadge } from './StatusBadge'

interface CheckResultProps {
  check: CheckResultType
  warningFormatDecision?: WarningFormatDecision
  onWarningFormatDecision?: (decision?: WarningFormatDecision) => void
}

export function CheckResult({
  check,
  warningFormatDecision,
  onWarningFormatDecision,
}: CheckResultProps) {
  return (
    <article className={`check-result check-${check.status}`}>
      <div className="check-heading">
        <h4>{check.label}</h4>
        <StatusBadge status={check.status} />
      </div>
      <p className="check-reason">{check.reason}</p>
      <dl className="evidence-grid">
        <div>
          <dt>Application</dt>
          <dd>{check.expected}</dd>
        </div>
        <div>
          <dt>Label evidence</dt>
          <dd>{check.observed}</dd>
        </div>
      </dl>
      {check.key === 'warningFormat' && onWarningFormatDecision && (
        <div
          className="warning-decision"
          aria-label="Warning format reviewer decision"
        >
          <p>
            Confirm this only after inspecting the image for physical type size,
            bold prefix, separation, and legibility.
          </p>
          <div>
            <button
              className="button button-secondary"
              type="button"
              aria-pressed={warningFormatDecision === 'pass'}
              onClick={() => onWarningFormatDecision('pass')}
            >
              Confirm compliant
            </button>
            <button
              className="button button-secondary"
              type="button"
              aria-pressed={warningFormatDecision === 'mismatch'}
              onClick={() => onWarningFormatDecision('mismatch')}
            >
              Flag formatting problem
            </button>
            {warningFormatDecision && (
              <button
                className="template-link"
                type="button"
                onClick={() => onWarningFormatDecision()}
              >
                Clear manual decision
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
