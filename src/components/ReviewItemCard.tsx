import { useState } from 'react'
import { CheckResult } from './CheckResult'
import { ChevronIcon, TrashIcon } from './icons'
import { ImageInspector } from './ImageInspector'
import { StatusBadge } from './StatusBadge'
import { parseExpectedAbv, parseExpectedNetContents } from '../domain/extract'
import { overallStatus } from '../domain/rules'
import type {
  ApplicationValues,
  ReviewItem,
  WarningFormatDecision,
} from '../domain/types'

function formatDuration(durationMs: number): string {
  return durationMs < 1000
    ? `${Math.round(durationMs)} ms`
    : `${(durationMs / 1000).toFixed(1)} s`
}

interface ReviewItemCardProps {
  item: ReviewItem
  index: number
  onChange: (id: string, field: keyof ApplicationValues, value: string) => void
  onRemove: (id: string) => void
  onRetry: (id: string) => void
  onWarningFormatDecision: (
    id: string,
    decision?: WarningFormatDecision,
  ) => void
  disabled: boolean
  valuesAreValid: (values: ApplicationValues) => boolean
}

export function ReviewItemCard({
  item,
  index,
  onChange,
  onRemove,
  onRetry,
  onWarningFormatDecision,
  disabled,
  valuesAreValid,
}: ReviewItemCardProps) {
  const [textOpen, setTextOpen] = useState(false)
  const status = item.checks ? overallStatus(item.checks) : undefined
  const abvIsInvalid =
    item.values.abv.trim().length > 0 &&
    parseExpectedAbv(item.values.abv) === null
  const netContentsIsInvalid =
    item.values.netContents.trim().length > 0 &&
    parseExpectedNetContents(item.values.netContents) === null
  const fields: Array<{
    key: keyof ApplicationValues
    label: string
    placeholder: string
    suffix?: string
    wide?: boolean
  }> = [
    { key: 'brand', label: 'Brand name', placeholder: "e.g. Stone's Throw" },
    {
      key: 'classType',
      label: 'Class / type',
      placeholder: 'e.g. Kentucky Straight Bourbon Whiskey',
    },
    { key: 'abv', label: 'Alcohol by volume', placeholder: '45', suffix: '%' },
    { key: 'netContents', label: 'Net contents', placeholder: '750 mL' },
    {
      key: 'nameAddress',
      label: 'Name & address statement',
      placeholder: 'e.g. Bottled by Example Distillery, Frankfort, Kentucky',
      wide: true,
    },
  ]

  return (
    <article
      className={`review-card review-card-${item.state}`}
      aria-labelledby={`item-${item.id}`}
    >
      <header className="review-card-header">
        <div className="file-identity">
          <span className="file-number">
            {String(index + 1).padStart(2, '0')}
          </span>
          <div>
            <h3 id={`item-${item.id}`}>{item.file.name}</h3>
            <p>
              {(item.file.size / 1024 / 1024).toFixed(2)} MB ·{' '}
              {item.file.type.replace('image/', '').toUpperCase()}
            </p>
          </div>
        </div>
        <div className="card-status-actions">
          {status && <StatusBadge status={status} />}
          <button
            className="icon-button"
            type="button"
            aria-label={`Remove ${item.file.name}`}
            onClick={() => onRemove(item.id)}
            disabled={disabled}
          >
            <TrashIcon />
          </button>
        </div>
      </header>
      <div className="review-card-body">
        <div className="image-column">
          <img
            src={item.previewUrl}
            alt={`Uploaded label: ${item.file.name}`}
          />
          <span className="image-caption">
            Original image · stays in browser
          </span>
          {item.checks && (
            <ImageInspector
              imageUrl={item.previewUrl}
              fileName={item.file.name}
            />
          )}
        </div>
        <div className="fields-column">
          <div className="application-fields">
            {fields.map((field) => {
              const inputId = `${item.id}-${field.key}`
              const validationMessage =
                field.key === 'abv' && abvIsInvalid
                  ? 'Enter a complete number from 0 to 100.'
                  : field.key === 'netContents' && netContentsIsInvalid
                    ? 'Enter a positive number followed by mL, L, or fl oz.'
                    : undefined
              return (
                <div
                  key={field.key}
                  className={
                    field.key === 'classType' || field.wide
                      ? 'field-wide'
                      : undefined
                  }
                >
                  <label htmlFor={inputId}>{field.label}</label>
                  <div
                    className={field.suffix ? 'input-with-suffix' : undefined}
                  >
                    <input
                      id={inputId}
                      type={field.key === 'abv' ? 'number' : 'text'}
                      inputMode={field.key === 'abv' ? 'decimal' : undefined}
                      min={field.key === 'abv' ? '0' : undefined}
                      max={field.key === 'abv' ? '100' : undefined}
                      step={field.key === 'abv' ? '0.1' : undefined}
                      value={item.values[field.key]}
                      placeholder={field.placeholder}
                      onChange={(event) =>
                        onChange(item.id, field.key, event.target.value)
                      }
                      disabled={disabled}
                      aria-invalid={validationMessage ? true : undefined}
                      aria-describedby={
                        validationMessage ? `${inputId}-error` : undefined
                      }
                      required
                    />
                    {field.suffix && (
                      <span aria-hidden="true">{field.suffix}</span>
                    )}
                  </div>
                  {validationMessage && (
                    <span className="field-error" id={`${inputId}-error`}>
                      {validationMessage}
                    </span>
                  )}
                </div>
              )
            })}
            <div>
              <label htmlFor={`${item.id}-productOrigin`}>Product origin</label>
              <select
                id={`${item.id}-productOrigin`}
                value={item.values.productOrigin}
                onChange={(event) =>
                  onChange(item.id, 'productOrigin', event.target.value)
                }
                disabled={disabled}
              >
                <option value="domestic">Domestic</option>
                <option value="imported">Imported</option>
              </select>
            </div>
            {item.values.productOrigin === 'imported' && (
              <div>
                <label htmlFor={`${item.id}-countryOfOrigin`}>
                  Country of origin
                </label>
                <input
                  id={`${item.id}-countryOfOrigin`}
                  type="text"
                  value={item.values.countryOfOrigin}
                  placeholder="e.g. France"
                  onChange={(event) =>
                    onChange(item.id, 'countryOfOrigin', event.target.value)
                  }
                  disabled={disabled}
                  required
                />
              </div>
            )}
          </div>
          {(item.state === 'queued' || item.state === 'processing') && (
            <div className="progress-block" role="status" aria-live="polite">
              <div className="progress-label">
                <span>{item.progressLabel}</span>
                <strong>{Math.round(item.progress * 100)}%</strong>
              </div>
              <div className="progress-track">
                <span style={{ width: `${item.progress * 100}%` }} />
              </div>
            </div>
          )}
          {item.state === 'error' && (
            <div className="item-error" role="alert">
              <div>
                <strong>Analysis stopped</strong>
                <p>{item.error}</p>
              </div>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => onRetry(item.id)}
                disabled={!valuesAreValid(item.values)}
              >
                Try again
              </button>
            </div>
          )}
          {item.result && item.checks && (
            <div className="results-block">
              <div className="results-heading">
                <div>
                  <p className="section-kicker">Step 3 · Review evidence</p>
                  <h3>
                    {status === 'pass'
                      ? 'All checks complete'
                      : status === 'mismatch'
                        ? 'Differences found'
                        : 'Manual review remains'}
                  </h3>
                </div>
                <div
                  className="ocr-metrics"
                  aria-label={`OCR confidence ${Math.round(item.result.confidence)} percent, analyzed in ${formatDuration(item.result.durationMs)}`}
                >
                  <span>
                    {Math.round(item.result.confidence)}% OCR confidence
                  </span>
                  <span>{formatDuration(item.result.durationMs)}</span>
                </div>
              </div>
              <div className="check-list">
                {item.checks.map((check) => (
                  <CheckResult
                    key={check.key}
                    check={check}
                    warningFormatDecision={item.warningFormatDecision}
                    onWarningFormatDecision={(decision) =>
                      onWarningFormatDecision(item.id, decision)
                    }
                  />
                ))}
              </div>
              <button
                className="extracted-toggle"
                type="button"
                aria-expanded={textOpen}
                onClick={() => setTextOpen((open) => !open)}
              >
                View extracted label text{' '}
                <ChevronIcon
                  className={textOpen ? 'chevron-open' : undefined}
                />
              </button>
              {textOpen && (
                <pre className="extracted-text">
                  {item.result.text || 'No text was extracted.'}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
