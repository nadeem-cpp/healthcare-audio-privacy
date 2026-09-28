import { MicCapture } from './capture/mic.ts'
import { encodeWav } from './audio/wav.ts'
import {
  CHUNK_SAMPLES,
  EngineStatus,
  SAMPLE_RATE,
  type EngineEvent,
  type PhiMapEntry,
  type TransformOptions,
  type WorkerIn,
  type WorkerOut,
} from './types.ts'
import TransformWorker from './workers/transform.worker.ts?worker'

export class EdgeEngine {
  #worker: Worker | null = null
  #capture = new MicCapture()
  #listeners = new Set<(event: EngineEvent) => void>()
  #options: TransformOptions = { voiceModel: false, filterModel: false }
  #seconds = 0
  #flushWaiters: Array<(samples: Float32Array) => void> = []
  #readyWaiters: Array<() => void> = []

  on(listener: (event: EngineEvent) => void): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  setOptions(options: TransformOptions): void {
    this.#options = options
    if (this.#worker) {
      this.#post({ type: 'configure', options })
    }
  }

  async start(options: TransformOptions): Promise<void> {
    this.#options = options
    this.#seconds = 0
    this.#emit({ type: 'phi', entries: [] })
    this.#ensureWorker()
    this.#emit({
      type: 'status',
      status: EngineStatus.loading,
      message: 'Preparing on-device models',
    })
    await this.#configureAndWait()
    this.#post({ type: 'wipe' })
    this.#emit({
      type: 'status',
      status: EngineStatus.recording,
      message: 'Recording',
    })
    await this.#capture.start(
      (chunk) => {
        this.#seconds += chunk.length / SAMPLE_RATE
        this.#emit({ type: 'progress', seconds: this.#seconds })
        this.#post({
          type: 'chunk',
          samples: chunk.buffer as ArrayBuffer,
          startTime: this.#seconds - chunk.length / SAMPLE_RATE,
        })
      },
      (value) => this.#emit({ type: 'level', rms: value }),
    )
  }

  async stop(): Promise<Float32Array> {
    const leftover = await this.#capture.stop()
    if (leftover && leftover.length > 0) {
      const padded =
        leftover.length >= 160
          ? leftover
          : (() => {
              const next = new Float32Array(160)
              next.set(leftover)
              return next
            })()
      this.#post({
        type: 'chunk',
        samples: padded.buffer as ArrayBuffer,
        startTime: this.#seconds,
      })
    }
    this.#emit({
      type: 'status',
      status: EngineStatus.processing,
      message: 'Sanitizing captured audio',
    })
    const samples = await this.#flush()
    this.#emit({ type: 'complete', samples, sampleRate: SAMPLE_RATE })
    this.#emit({
      type: 'status',
      status: EngineStatus.ready,
      message: 'Sanitized audio ready',
    })
    return samples
  }

  async processPcm(samples: Float32Array, options: TransformOptions): Promise<Float32Array> {
    this.#options = options
    this.#ensureWorker()
    await this.#configureAndWait()
    this.#post({ type: 'wipe' })
    this.#emit({
      type: 'status',
      status: EngineStatus.processing,
      message: 'Processing audio',
    })
    const pcm = samples
    for (let i = 0; i < pcm.length; i += CHUNK_SAMPLES) {
      const chunk = pcm.slice(i, Math.min(pcm.length, i + CHUNK_SAMPLES))
      this.#post({
        type: 'chunk',
        samples: chunk.buffer as ArrayBuffer,
        startTime: i / SAMPLE_RATE,
      })
    }
    const result = await this.#flush()
    this.#emit({ type: 'complete', samples: result, sampleRate: SAMPLE_RATE })
    this.#emit({
      type: 'status',
      status: EngineStatus.ready,
      message: 'Sanitized audio ready',
    })
    return result
  }

  wipe(): void {
    this.#post({ type: 'wipe' })
    this.#emit({ type: 'phi', entries: [] })
  }

  dispose(): void {
    void this.#capture.stop()
    this.wipe()
    this.#worker?.terminate()
    this.#worker = null
    this.#listeners.clear()
  }

  toWavUrl(samples: Float32Array): string {
    return URL.createObjectURL(encodeWav(samples, SAMPLE_RATE))
  }

  #ensureWorker(): void {
    if (this.#worker) {
      return
    }
    const worker = new TransformWorker()
    worker.onmessage = (event: MessageEvent<WorkerOut>) => {
      const message = event.data
      if (message.type === 'ready') {
        this.#readyWaiters.splice(0).forEach((resolve) => resolve())
        return
      }
      if (message.type === 'status') {
        this.#emit({
          type: 'status',
          status: message.status,
          message: message.message,
        })
        return
      }
      if (message.type === 'phi') {
        this.#emit({ type: 'phi', entries: message.entries })
        return
      }
      if (message.type === 'complete') {
        const samples = new Float32Array(message.samples)
        this.#flushWaiters.splice(0).forEach((resolve) => resolve(samples))
        return
      }
      if (message.type === 'error') {
        this.#emit({ type: 'error', message: message.message })
        this.#emit({
          type: 'status',
          status: EngineStatus.error,
          message: message.message,
        })
      }
    }
    worker.onerror = (event) => {
      const message = event.message || 'Worker failed'
      this.#emit({ type: 'error', message })
    }
    this.#worker = worker
  }

  #configureAndWait(): Promise<void> {
    const ready = new Promise<void>((resolve) => {
      this.#readyWaiters.push(resolve)
    })
    this.#post({ type: 'configure', options: this.#options })
    return ready
  }

  #flush(): Promise<Float32Array> {
    const done = new Promise<Float32Array>((resolve) => {
      this.#flushWaiters.push(resolve)
    })
    this.#post({ type: 'flush' })
    return done
  }

  #post(message: WorkerIn): void {
    this.#worker?.postMessage(message)
  }

  #emit(event: EngineEvent): void {
    this.#listeners.forEach((listener) => listener(event))
  }
}

export type { PhiMapEntry, TransformOptions }
