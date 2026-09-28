export const SAMPLE_RATE = 16_000
export const CHUNK_SECONDS = 1
export const CHUNK_SAMPLES = SAMPLE_RATE * CHUNK_SECONDS
export const PHI_WINDOW_SECONDS = 6
export const PHI_WINDOW_SAMPLES = SAMPLE_RATE * PHI_WINDOW_SECONDS
export const EMBED_LOCK_SECONDS = 2

export const PhiType = {
  PATIENT: 'PATIENT',
  DATE: 'DATE',
  LOC: 'LOC',
  PHONE: 'PHONE',
  ID: 'ID',
  EMAIL: 'EMAIL',
} as const

export type PhiType = (typeof PhiType)[keyof typeof PhiType]

export type PcmChunk = {
  samples: Float32Array
  sampleRate: number
  startTime: number
}

export type TransformOptions = {
  voiceModel: boolean
  filterModel: boolean
}

export type PhiEntity = {
  type: PhiType
  original: string
  surrogate: string
  start: number
  end: number
}

export type PhiMapEntry = {
  surrogate: string
  original: string
  type: PhiType
}

export type SanitizedSegment = {
  samples: Float32Array
  startTime: number
  transcript?: string
  entities: PhiEntity[]
}

export const EngineStatus = {
  idle: 'idle',
  loading: 'loading',
  ready: 'ready',
  recording: 'recording',
  processing: 'processing',
  error: 'error',
} as const

export type EngineStatus = (typeof EngineStatus)[keyof typeof EngineStatus]

export type EngineEvent =
  | { type: 'status'; status: EngineStatus; message?: string }
  | { type: 'level'; rms: number }
  | { type: 'progress'; seconds: number }
  | { type: 'phi'; entries: PhiMapEntry[] }
  | { type: 'complete'; samples: Float32Array; sampleRate: number }
  | { type: 'error'; message: string }

export type WorkerIn =
  | { type: 'configure'; options: TransformOptions }
  | { type: 'chunk'; samples: ArrayBuffer; startTime: number }
  | { type: 'flush' }
  | { type: 'wipe' }

export type WorkerOut =
  | { type: 'ready' }
  | { type: 'status'; status: EngineStatus; message?: string }
  | { type: 'phi'; entries: PhiMapEntry[] }
  | { type: 'complete'; samples: ArrayBuffer; sampleRate: number }
  | { type: 'error'; message: string }
