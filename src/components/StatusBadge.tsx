import type { CheckStatus } from '../domain/types'

const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: 'Pass',
  mismatch: 'Mismatch',
  review: 'Needs review',
}

export function StatusBadge({ status }: { status: CheckStatus }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span className="status-symbol" aria-hidden="true">
        {status === 'pass' ? '✓' : status === 'mismatch' ? '×' : '!'}
      </span>
      {STATUS_LABEL[status]}
    </span>
  )
}
