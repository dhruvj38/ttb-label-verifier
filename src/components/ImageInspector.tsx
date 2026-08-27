import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'

interface ImageInspectorProps {
  imageUrl: string
  fileName: string
}

export function ImageInspector({ imageUrl, fileName }: ImageInspectorProps) {
  const [open, setOpen] = useState(false)
  const [zoom, setZoom] = useState(150)
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  function close() {
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key !== 'Tab') return

    const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex="0"]',
    )
    if (!controls?.length) return
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        className="button button-secondary warning-inspector-trigger"
        type="button"
        onClick={() => setOpen(true)}
      >
        Inspect warning formatting
      </button>

      {open && (
        <div
          className="inspection-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) close()
          }}
        >
          <section
            ref={dialogRef}
            className="inspection-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            aria-describedby={`${id}-description`}
            onKeyDown={handleKeyDown}
          >
            <header className="inspection-header">
              <div>
                <p className="section-kicker">Manual evidence check</p>
                <h2 id={`${id}-title`}>Inspect government warning</h2>
                <p id={`${id}-description`}>
                  Zoom and pan the original label to inspect uppercase, bold
                  weight, separation, contrast, and legibility.
                </p>
              </div>
              <button
                ref={closeRef}
                className="button button-secondary"
                type="button"
                onClick={close}
              >
                Close inspection
              </button>
            </header>

            <div className="inspection-controls">
              <label htmlFor={`${id}-zoom`}>Zoom</label>
              <input
                id={`${id}-zoom`}
                type="range"
                min="100"
                max="300"
                step="25"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
              <output htmlFor={`${id}-zoom`}>{zoom}%</output>
            </div>

            <div
              className="inspection-viewport"
              tabIndex={0}
              aria-label="Zoomed label image. Use arrow keys or touch to pan."
            >
              <img
                src={imageUrl}
                alt={`Zoomable label evidence for ${fileName}`}
                style={{ width: `${zoom}%` }}
              />
            </div>
          </section>
        </div>
      )}
    </>
  )
}
