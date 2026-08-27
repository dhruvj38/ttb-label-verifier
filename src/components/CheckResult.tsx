import type { CheckResult as CheckResultType } from '../domain/types'
import { StatusBadge } from './StatusBadge'

export function CheckResult({ check }: { check: CheckResultType }) {
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
    </article>
  )
}
