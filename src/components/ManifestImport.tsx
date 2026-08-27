import { useRef, useState, type ChangeEvent } from 'react'
import {
  MANIFEST_TEMPLATE,
  matchManifestToFiles,
  parseManifest,
} from '../domain/manifest'
import type { ApplicationValues } from '../domain/types'

interface ManifestImportProps {
  filenames: string[]
  disabled: boolean
  onApply: (valuesByFilename: Map<string, ApplicationValues>) => boolean
}

async function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(reader.error ?? new Error('Unable to read CSV.'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsText(file)
  })
}

export function ManifestImport({
  filenames,
  disabled,
  onApply,
}: ManifestImportProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const filenamesRef = useRef(filenames)
  const [messages, setMessages] = useState<string[]>([])
  const [isSuccess, setIsSuccess] = useState(false)
  filenamesRef.current = filenames

  function downloadTemplate() {
    const url = URL.createObjectURL(
      new Blob([MANIFEST_TEMPLATE], { type: 'text/csv;charset=utf-8' }),
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'label-verifier-manifest-template.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const parsed = parseManifest(await readFileAsText(file))
    const currentFilenames = filenamesRef.current
    const matched = matchManifestToFiles(parsed.rows, currentFilenames)
    const errors = [...parsed.errors, ...matched.errors]
    if (errors.length) {
      setMessages(errors)
      setIsSuccess(false)
      return
    }
    if (!onApply(matched.valuesByFilename)) {
      setMessages([
        'Selected images changed while the CSV was being read. The manifest was not applied; import it again.',
      ])
      setIsSuccess(false)
      return
    }
    setMessages([
      `Applied ${parsed.rows.length} manifest row${parsed.rows.length === 1 ? '' : 's'} to ${currentFilenames.length} selected image${currentFilenames.length === 1 ? '' : 's'}.`,
    ])
    setIsSuccess(true)
  }

  return (
    <aside className="manifest-import" aria-labelledby="manifest-heading">
      <div>
        <p className="section-kicker">Batch shortcut</p>
        <h3 id="manifest-heading">Import application values from CSV</h3>
        <p>
          Match every selected filename once. The entire batch updates only when
          every row is valid.
        </p>
      </div>
      <div className="manifest-actions">
        <button
          className="button button-secondary"
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          Import CSV manifest
        </button>
        <button
          className="template-link"
          type="button"
          onClick={downloadTemplate}
        >
          Download template
        </button>
      </div>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="text/csv,.csv"
        aria-label="Import CSV manifest"
        onChange={(event) => void importFile(event)}
      />
      {messages.length > 0 && (
        <div
          className={
            isSuccess ? 'manifest-message manifest-success' : 'manifest-message'
          }
          role={isSuccess ? 'status' : 'alert'}
        >
          <strong>
            {isSuccess ? 'Manifest applied' : 'Manifest was not applied'}
          </strong>
          <ul>
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}
