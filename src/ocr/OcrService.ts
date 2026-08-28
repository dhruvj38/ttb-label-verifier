import { createWorker, OEM, PSM, type Worker } from 'tesseract.js'
import type { OcrEngine, OcrResult } from '../domain/types'
import { preprocessImage } from './preprocess'

type ProgressListener = (progress: number, label: string) => void

interface WorkerSlot {
  workerPromise?: Promise<Worker>
  listener?: ProgressListener
  busy: boolean
}

function recommendedWorkerCount(): number {
  // Two workers nearly halve large-batch time without the memory spike caused
  // by creating one worker per image. Keep constrained devices on one worker.
  return (navigator.hardwareConcurrency || 4) >= 4 ? 2 : 1
}

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
  readonly maxConcurrency: number
  private readonly slots: WorkerSlot[]
  private readonly waiters: Array<(slot: WorkerSlot) => void> = []

  constructor(workerCount = recommendedWorkerCount()) {
    this.maxConcurrency = Math.max(1, Math.min(2, Math.floor(workerCount)))
    this.slots = Array.from({ length: this.maxConcurrency }, () => ({
      busy: false,
    }))
  }

  async warm(): Promise<number> {
    const startedAt = performance.now()
    await Promise.all(this.slots.map((slot) => this.getWorker(slot)))
    return performance.now() - startedAt
  }

  async recognize(
    file: File,
    onProgress?: ProgressListener,
  ): Promise<OcrResult> {
    const startedAt = performance.now()
    onProgress?.(0.06, 'Preparing image')
    const image = await preprocessImage(file)
    onProgress?.(0.14, 'Image ready')
    const slot = await this.acquireSlot()
    slot.listener = onProgress

    try {
      const worker = await this.getWorker(slot)
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
      slot.listener = undefined
      this.releaseSlot(slot)
    }
  }

  async terminate(): Promise<void> {
    await Promise.all(
      this.slots.map(async (slot) => {
        if (!slot.workerPromise) return
        const worker = await slot.workerPromise
        await worker.terminate()
        slot.workerPromise = undefined
      }),
    )
  }

  private acquireSlot(): Promise<WorkerSlot> {
    const available = this.slots.find((slot) => !slot.busy)
    if (available) {
      available.busy = true
      return Promise.resolve(available)
    }
    return new Promise((resolve) => this.waiters.push(resolve))
  }

  private releaseSlot(slot: WorkerSlot): void {
    const next = this.waiters.shift()
    if (next) next(slot)
    else slot.busy = false
  }

  private getWorker(slot: WorkerSlot): Promise<Worker> {
    if (!slot.workerPromise) {
      const assetRoot = `${import.meta.env.BASE_URL}ocr`
      slot.workerPromise = createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: `${assetRoot}/worker.min.js`,
        corePath: `${assetRoot}/tesseract-core-lstm.wasm.js`,
        langPath: assetRoot,
        gzip: true,
        logger: ({ status, progress }) => {
          if (status === 'recognizing text') {
            slot.listener?.(0.18 + progress * 0.8, readableStatus(status))
          } else {
            slot.listener?.(
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
          slot.workerPromise = undefined
          throw error
        })
    }
    return slot.workerPromise
  }
}

export const sharedOcrService = new BrowserOcrService()
