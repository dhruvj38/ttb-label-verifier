export type CheckStatus = 'pass' | 'mismatch' | 'review'

export type ItemState = 'ready' | 'queued' | 'processing' | 'complete' | 'error'

export interface ApplicationValues {
  brand: string
  classType: string
  abv: string
  netContents: string
}

export interface OcrResult {
  text: string
  confidence: number
  durationMs: number
}

export type CheckKey =
  | 'brand'
  | 'classType'
  | 'abv'
  | 'netContents'
  | 'warningText'
  | 'warningFormat'

export interface CheckResult {
  key: CheckKey
  label: string
  status: CheckStatus
  expected: string
  observed: string
  reason: string
  confidence?: number
}

export interface ReviewItem {
  id: string
  file: File
  previewUrl: string
  values: ApplicationValues
  state: ItemState
  progress: number
  progressLabel: string
  result?: OcrResult
  checks?: CheckResult[]
  error?: string
}

export interface OcrEngine {
  warm(): Promise<number>
  recognize(
    file: File,
    onProgress?: (progress: number, label: string) => void,
  ): Promise<OcrResult>
  terminate(): Promise<void>
}

export const EMPTY_VALUES: ApplicationValues = {
  brand: '',
  classType: '',
  abv: '',
  netContents: '',
}

export const SAMPLE_VALUES: ApplicationValues = {
  brand: 'OLD TOM DISTILLERY',
  classType: 'Kentucky Straight Bourbon Whiskey',
  abv: '45',
  netContents: '750 mL',
}
