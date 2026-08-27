import { createWorker, OEM, PSM, type Worker } from 'tesseract.js'
import type { OcrEngine, OcrResult } from '../domain/types'
import { preprocessImage } from './preprocess'

type ProgressListener = (progress: number, label: string) => void

function warningRegionConfidence(
  blocks: Awaited<ReturnType<Worker['recognize']>>['data']['blocks'],
): number | undefined {
  const lines =
    blocks
      ?.flatMap((block) => block.paragraphs)
      .flatMap((paragraph) => paragraph.lines)
      .sort((left, right) => left.bbox.y0 - right.bbox.y0) ?? []
  const start = lines.findIndex((line) =>
    /government\s+warning\s*:/i.test(line.text),
  )
  if (start < 0) return undefined

  const warningLines = []
  let characterCount = 0
  for (const line of lines.slice(start)) {
    warningLines.push(line)
    characterCount += line.text.trim().length
    if (characterCount >= 310) break
  }
  const weight = warningLines.reduce(
    (total, line) => total + Math.max(1, line.text.trim().length),
    0,
  )
  if (!weight) return undefined
  return (
    warningLines.reduce(
      (total, line) =>
        total + line.confidence * Math.max(1, line.text.trim().length),
      0,
    ) / weight
  )
}

function readableStatus(status: string): string {
  const labels: Record<string, string> = {
    'loading tesseract core': 'Loading OCR engine',
    'initializing tesseract': 'Starting OCR engine',
    'loading language traineddata': 'Loading English model',
    'initializing api': 'Preparing text recognition',
    'recognizing text': 'Reading label text',
  }
  return labels[status] ?? 'Preparing analysis'
}

export class BrowserOcrService implements OcrEngine {
  private workerPromise?: Promise<Worker>
  private listener?: ProgressListener

  async warm(): Promise<number> {
    const startedAt = performance.now()
    await this.getWorker()
    return performance.now() - startedAt
  }

  async recognize(
    file: File,
    onProgress?: ProgressListener,
  ): Promise<OcrResult> {
    const startedAt = performance.now()
    this.listener = onProgress
    onProgress?.(0.06, 'Preparing image')
    const image = await preprocessImage(file)
    onProgress?.(0.14, 'Image ready')

    try {
      const worker = await this.getWorker()
      const result = await worker.recognize(
        image,
        {},
        { blocks: true, text: true },
      )
      onProgress?.(1, 'Analysis complete')
      return {
        text: result.data.text,
        confidence: result.data.confidence,
        warningConfidence: warningRegionConfidence(result.data.blocks),
        durationMs: performance.now() - startedAt,
      }
    } finally {
      this.listener = undefined
    }
  }

  async terminate(): Promise<void> {
    if (!this.workerPromise) return
    const worker = await this.workerPromise
    await worker.terminate()
    this.workerPromise = undefined
  }

  private getWorker(): Promise<Worker> {
    if (!this.workerPromise) {
      const assetRoot = `${import.meta.env.BASE_URL}ocr`
      this.workerPromise = createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: `${assetRoot}/worker.min.js`,
        corePath: `${assetRoot}/tesseract-core-lstm.wasm.js`,
        langPath: assetRoot,
        gzip: true,
        logger: ({ status, progress }) => {
          if (status === 'recognizing text') {
            this.listener?.(0.18 + progress * 0.8, readableStatus(status))
          } else {
            this.listener?.(
              Math.min(0.16, progress * 0.16),
              readableStatus(status),
            )
          }
        },
      })
        .then(async (worker) => {
          await worker.setParameters({
            tessedit_pageseg_mode: PSM.SPARSE_TEXT,
            preserve_interword_spaces: '1',
          })
          return worker
        })
        .catch((error: unknown) => {
          this.workerPromise = undefined
          throw error
        })
    }
    return this.workerPromise
  }
}

export const sharedOcrService = new BrowserOcrService()
