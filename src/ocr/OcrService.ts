import { createWorker, OEM, PSM, type Worker } from 'tesseract.js'
import type { OcrEngine, OcrResult } from '../domain/types'
import { preprocessImage } from './preprocess'

type ProgressListener = (progress: number, label: string) => void

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
      const result = await worker.recognize(image)
      onProgress?.(1, 'Analysis complete')
      return {
        text: result.data.text,
        confidence: result.data.confidence,
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
