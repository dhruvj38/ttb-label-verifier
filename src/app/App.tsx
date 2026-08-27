import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import { CheckResult } from '../components/CheckResult'
import {
  ChevronIcon,
  LockIcon,
  SparkIcon,
  TrashIcon,
  UploadIcon,
} from '../components/icons'
import { StatusBadge } from '../components/StatusBadge'
import { evaluateLabel, overallStatus, statusCounts } from '../domain/rules'
import {
  EMPTY_VALUES,
  SAMPLE_VALUES,
  type ApplicationValues,
  type OcrEngine,
  type ReviewItem,
} from '../domain/types'
import { sharedOcrService } from '../ocr/OcrService'

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_FILE_SIZE = 12 * 1024 * 1024

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.has(file.type)) {
    return `${file.name}: choose a JPEG, PNG, or WebP image.`
  }
  if (file.size > MAX_FILE_SIZE) {
    return `${file.name}: the 12 MB file limit was exceeded.`
  }
  return null
}

function valuesAreComplete(values: ApplicationValues): boolean {
  return Object.values(values).every((value) => value.trim().length > 0)
}

function formatDuration(durationMs: number): string {
  return durationMs < 1000
    ? `${Math.round(durationMs)} ms`
    : `${(durationMs / 1000).toFixed(1)} s`
}

interface AppProps {
  ocrEngine?: OcrEngine
}

export function App({ ocrEngine = sharedOcrService }: AppProps) {
  const [items, setItems] = useState<ReviewItem[]>([])
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [warmState, setWarmState] = useState<'warming' | 'ready' | 'error'>(
    'warming',
  )
  const [warmDuration, setWarmDuration] = useState<number>()
  const inputRef = useRef<HTMLInputElement>(null)
  const itemsRef = useRef(items)
  itemsRef.current = items

  useEffect(() => {
    let active = true
    void ocrEngine
      .warm()
      .then((duration) => {
        if (active) {
          setWarmDuration(duration)
          setWarmState('ready')
        }
      })
      .catch(() => {
        if (active) setWarmState('error')
      })
    return () => {
      active = false
    }
  }, [ocrEngine])

  useEffect(
    () => () => {
      for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl)
    },
    [],
  )

  const completedItems = items.filter((item) => item.state === 'complete')
  const allChecks = completedItems.flatMap((item) => item.checks ?? [])
  const counts = statusCounts(allChecks)
  const activeStep = items.length === 0 ? 1 : completedItems.length > 0 ? 3 : 2
  const isBusy = items.some(
    (item) => item.state === 'queued' || item.state === 'processing',
  )
  const canAnalyze =
    items.length > 0 &&
    !isBusy &&
    items.every((item) => valuesAreComplete(item.values))

  const batchStatus = useMemo(() => {
    if (isBusy)
      return `Analyzing ${items.filter((item) => item.state === 'complete').length + 1} of ${items.length}`
    if (completedItems.length > 0)
      return `${completedItems.length} label${completedItems.length === 1 ? '' : 's'} reviewed`
    return `${items.length} label${items.length === 1 ? '' : 's'} ready`
  }, [completedItems.length, isBusy, items])

  function updateItem(id: string, update: Partial<ReviewItem>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...update } : item)),
    )
  }

  function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    const errors = files
      .map(validateFile)
      .filter((error): error is string => !!error)
    const accepted = files.filter((file) => !validateFile(file))
    setUploadErrors(errors)
    if (accepted.length === 0) return

    setItems((current) => [
      ...current,
      ...accepted.map((file) => ({
        id: makeId(),
        file,
        previewUrl: URL.createObjectURL(file),
        values: { ...EMPTY_VALUES },
        state: 'ready' as const,
        progress: 0,
        progressLabel: 'Ready to analyze',
      })),
    ])
  }

  async function addSample() {
    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}samples/valid-bourbon.png`,
      )
      if (!response.ok) throw new Error('Sample unavailable')
      const blob = await response.blob()
      const file = new File([blob], 'old-tom-bourbon.png', {
        type: 'image/png',
      })
      setItems((current) => [
        ...current,
        {
          id: makeId(),
          file,
          previewUrl: URL.createObjectURL(file),
          values: { ...SAMPLE_VALUES },
          state: 'ready',
          progress: 0,
          progressLabel: 'Ready to analyze',
        },
      ])
      setUploadErrors([])
    } catch {
      setUploadErrors([
        'The sample label could not be loaded. Choose an image instead.',
      ])
    }
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addFiles(event.target.files)
    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    addFiles(event.dataTransfer.files)
  }

  function updateValues(
    id: string,
    field: keyof ApplicationValues,
    value: string,
  ) {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              values: { ...item.values, [field]: value },
              state: item.state === 'complete' ? 'ready' : item.state,
              checks: item.state === 'complete' ? undefined : item.checks,
            }
          : item,
      ),
    )
  }

  function removeItem(id: string) {
    const item = itemsRef.current.find((candidate) => candidate.id === id)
    if (item) URL.revokeObjectURL(item.previewUrl)
    setItems((current) => current.filter((candidate) => candidate.id !== id))
  }

  function startOver() {
    for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl)
    setItems([])
    setUploadErrors([])
  }

  async function processItem(id: string) {
    const item = itemsRef.current.find((candidate) => candidate.id === id)
    if (!item) return
    updateItem(id, {
      state: 'processing',
      error: undefined,
      checks: undefined,
      progress: 0.02,
      progressLabel: 'Starting analysis',
    })

    try {
      const result = await ocrEngine.recognize(item.file, (progress, label) => {
        updateItem(id, { progress, progressLabel: label })
      })
      const checks = evaluateLabel(item.values, result.text, result.confidence)
      updateItem(id, {
        state: 'complete',
        result,
        checks,
        progress: 1,
        progressLabel: 'Analysis complete',
      })
    } catch (error) {
      updateItem(id, {
        state: 'error',
        progress: 0,
        progressLabel: 'Analysis stopped',
        error:
          error instanceof Error
            ? error.message
            : 'Text recognition failed. Try a clearer image.',
      })
    }
  }

  async function analyzeAll() {
    const ids = itemsRef.current.map((item) => item.id)
    setItems((current) =>
      current.map((item) => ({
        ...item,
        state: 'queued',
        progress: 0,
        progressLabel: 'Queued',
        error: undefined,
      })),
    )
    for (const id of ids) await processItem(id)
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Skip to label review
      </a>

      <header className="site-header">
        <a
          className="wordmark"
          href={import.meta.env.BASE_URL}
          aria-label="Label Verifier home"
        >
          <span className="wordmark-mark" aria-hidden="true">
            LV
          </span>
          <span>
            <strong>Label Verifier</strong>
            <small>Distilled spirits review aid</small>
          </span>
        </a>
        <div className="prototype-tag">
          Prototype · Not official TTB approval
        </div>
      </header>

      <main id="workspace">
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <p className="eyebrow">Artwork-to-application review</p>
            <h1 id="page-title">
              Make the label say what the application says.
            </h1>
            <p className="hero-intro">
              Add distilled-spirits labels, enter the submitted values, and get
              an evidence-linked first pass in your browser.
            </p>
          </div>
          <aside className="privacy-note">
            <LockIcon />
            <div>
              <strong>Your images stay on this device</strong>
              <span>No upload, account, or external OCR service.</span>
            </div>
          </aside>
        </section>

        <nav className="step-rail" aria-label="Review steps">
          {[
            ['1', 'Add labels', 'JPEG, PNG or WebP'],
            ['2', 'Enter application', 'Four distilled-spirits fields'],
            ['3', 'Review evidence', 'Pass, mismatch or review'],
          ].map(([number, label, detail], index) => {
            const step = index + 1
            const state =
              step < activeStep
                ? 'done'
                : step === activeStep
                  ? 'active'
                  : 'next'
            return (
              <div
                className={`step step-${state}`}
                key={number}
                aria-current={state === 'active' ? 'step' : undefined}
              >
                <span className="step-number">
                  {state === 'done' ? '✓' : number}
                </span>
                <span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
              </div>
            )
          })}
        </nav>

        <section
          className="panel upload-panel"
          aria-labelledby="upload-heading"
        >
          <div className="section-heading">
            <div>
              <p className="section-kicker">Step 1</p>
              <h2 id="upload-heading">Add label artwork</h2>
              <p>
                Select one label or a batch. Each image gets its own application
                record.
              </p>
            </div>
            <div className={`engine-state engine-${warmState}`} role="status">
              <span aria-hidden="true" />
              {warmState === 'ready'
                ? `OCR ready${warmDuration !== undefined ? ` · ${formatDuration(warmDuration)}` : ''}`
                : warmState === 'error'
                  ? 'OCR will retry on analysis'
                  : 'Warming OCR'}
            </div>
          </div>

          <div
            className={`drop-zone ${isDragging ? 'drop-zone-active' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (event.currentTarget === event.target) setIsDragging(false)
            }}
            onDrop={handleDrop}
          >
            <div className="upload-icon">
              <UploadIcon />
            </div>
            <div>
              <h3>Drop label images here</h3>
              <p>Up to 12 MB each · full batches supported</p>
            </div>
            <div className="drop-actions">
              <button
                className="button button-primary"
                type="button"
                onClick={() => inputRef.current?.click()}
              >
                Choose images
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => void addSample()}
              >
                <SparkIcon /> Try sample label
              </button>
            </div>
            <input
              ref={inputRef}
              className="visually-hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handleInput}
              aria-label="Choose label images"
            />
          </div>

          {uploadErrors.length > 0 && (
            <div className="error-banner" role="alert">
              <strong>Some images were not added</strong>
              <ul>
                {uploadErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {items.length > 0 && (
          <section
            className="review-workspace"
            aria-labelledby="application-heading"
          >
            <div className="workspace-header">
              <div>
                <p className="section-kicker">Step 2</p>
                <h2 id="application-heading">Enter application values</h2>
                <p>{batchStatus}. Fields are kept if another label fails.</p>
              </div>
              <div className="workspace-actions">
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={startOver}
                  disabled={isBusy}
                >
                  Start over
                </button>
                <button
                  className="button button-primary button-analyze"
                  type="button"
                  onClick={() => void analyzeAll()}
                  disabled={!canAnalyze}
                >
                  <SparkIcon />
                  {completedItems.length > 0
                    ? 'Analyze again'
                    : `Analyze ${items.length === 1 ? 'label' : `${items.length} labels`}`}
                </button>
              </div>
            </div>

            {!canAnalyze && !isBusy && (
              <p className="form-hint">
                Complete all four application fields for every label to analyze
                the batch.
              </p>
            )}

            <div className="item-list">
              {items.map((item, index) => (
                <ReviewItemCard
                  key={item.id}
                  item={item}
                  index={index}
                  onChange={updateValues}
                  onRemove={removeItem}
                  onRetry={(id) => void processItem(id)}
                  disabled={isBusy}
                />
              ))}
            </div>
          </section>
        )}

        {completedItems.length > 0 && (
          <section className="batch-summary" aria-labelledby="summary-heading">
            <div>
              <p className="section-kicker">Batch summary</p>
              <h2 id="summary-heading">Evidence at a glance</h2>
            </div>
            <div className="summary-counts">
              <span className="count-pass">
                <strong>{counts.pass}</strong> passed
              </span>
              <span className="count-review">
                <strong>{counts.review}</strong> need review
              </span>
              <span className="count-mismatch">
                <strong>{counts.mismatch}</strong> mismatches
              </span>
            </div>
          </section>
        )}

        <section className="scope-note" aria-labelledby="scope-heading">
          <div className="scope-rule" aria-hidden="true">
            Decision aid
          </div>
          <div>
            <h2 id="scope-heading">The final call stays with the reviewer.</h2>
            <p>
              OCR can compare text and values. It cannot confirm physical type
              size, bold weight, separation, or real-world legibility from a
              photograph. Those checks always remain manual in this prototype.
            </p>
          </div>
        </section>
      </main>

      <footer>
        <span>Label Verifier · Local-first proof of concept</span>
        <a
          href="https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-16/subpart-C/section-16.21"
          target="_blank"
          rel="noreferrer"
        >
          Warning text source: 27 CFR § 16.21
        </a>
      </footer>
    </div>
  )
}

interface ReviewItemCardProps {
  item: ReviewItem
  index: number
  onChange: (id: string, field: keyof ApplicationValues, value: string) => void
  onRemove: (id: string) => void
  onRetry: (id: string) => void
  disabled: boolean
}

function ReviewItemCard({
  item,
  index,
  onChange,
  onRemove,
  onRetry,
  disabled,
}: ReviewItemCardProps) {
  const [textOpen, setTextOpen] = useState(false)
  const status = item.checks ? overallStatus(item.checks) : undefined
  const fields: Array<{
    key: keyof ApplicationValues
    label: string
    placeholder: string
    suffix?: string
  }> = [
    { key: 'brand', label: 'Brand name', placeholder: "e.g. Stone's Throw" },
    {
      key: 'classType',
      label: 'Class / type',
      placeholder: 'e.g. Kentucky Straight Bourbon Whiskey',
    },
    { key: 'abv', label: 'Alcohol by volume', placeholder: '45', suffix: '%' },
    { key: 'netContents', label: 'Net contents', placeholder: '750 mL' },
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
        </div>
        <div className="fields-column">
          <div className="application-fields">
            {fields.map((field) => {
              const inputId = `${item.id}-${field.key}`
              return (
                <div
                  key={field.key}
                  className={
                    field.key === 'classType' ? 'field-wide' : undefined
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
                      required
                    />
                    {field.suffix && (
                      <span aria-hidden="true">{field.suffix}</span>
                    )}
                  </div>
                </div>
              )
            })}
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
                disabled={!valuesAreComplete(item.values)}
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
                    {status === 'mismatch'
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
                  <CheckResult key={check.key} check={check} />
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
