import { env } from '@huggingface/transformers'
import { concatFloat32 } from '../audio/resample.ts'
import { transcribe } from '../phi/asr.ts'
import { detectPhi } from '../phi/ner.ts'
import { PhiMapStore } from '../phi/phiMap.ts'
import { muteEntities, spansToEntities } from '../phi/redact.ts'
import {
  EngineStatus,
  PHI_WINDOW_SAMPLES,
  SAMPLE_RATE,
  type TransformOptions,
  type WorkerIn,
  type WorkerOut,
} from '../types.ts'
import { isVoiced, loadVad } from '../vad/vad.ts'
import { VoiceAnonymizer } from '../voice/anonymizer.ts'
import { loadSpeakerEncoder } from '../voice/embedding.ts'
import { loadAsr } from '../phi/asr.ts'
import { loadNer } from '../phi/ner.ts'

env.allowLocalModels = false
env.useBrowserCache = true
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1
}

const anonymizer = new VoiceAnonymizer()
const phiMap = new PhiMapStore()
let options: TransformOptions = { voiceModel: false, filterModel: false }
const output: Float32Array[] = []
const phiBuffer: Float32Array[] = []
let modelsReady = false

function post(message: WorkerOut, transfer?: Transferable[]): void {
  if (transfer) {
    self.postMessage(message, { transfer })
  } else {
    self.postMessage(message)
  }
}

function resetBuffers(): void {
  output.length = 0
  phiBuffer.length = 0
  anonymizer.reset()
}

async function ensureModels(next: TransformOptions): Promise<void> {
  post({ type: 'status', status: EngineStatus.loading, message: 'Loading VAD' })
  await loadVad()
  if (next.voiceModel) {
    post({
      type: 'status',
      status: EngineStatus.loading,
      message: 'Loading speaker encoder',
    })
    await loadSpeakerEncoder()
  }
  if (next.filterModel) {
    post({
      type: 'status',
      status: EngineStatus.loading,
      message: 'Loading Whisper Tiny',
    })
    await loadAsr()
    post({
      type: 'status',
      status: EngineStatus.loading,
      message: 'Loading clinical NER',
    })
    await loadNer()
  }
  modelsReady = true
  post({ type: 'status', status: EngineStatus.ready, message: 'Models ready' })
}

async function flushPhiWindow(): Promise<void> {
  if (phiBuffer.length === 0) {
    return
  }
  const joined = concatFloat32(phiBuffer)
  phiBuffer.length = 0
  const asr = await transcribe(joined)
  const spans = asr.text ? await detectPhi(asr.text) : []
  const entities = spansToEntities(
    spans,
    asr.words,
    joined.length / SAMPLE_RATE,
    phiMap,
  )
  output.push(muteEntities(joined, entities))
  post({ type: 'phi', entries: phiMap.list() })
}

async function handleChunk(samples: Float32Array): Promise<void> {
  let pcm = samples
  const voiced = await isVoiced(pcm, SAMPLE_RATE)
  if (options.voiceModel && voiced) {
    pcm = await anonymizer.anonymize(pcm)
  }
  if (options.filterModel) {
    phiBuffer.push(pcm)
    const pending = phiBuffer.reduce((n, p) => n + p.length, 0)
    if (pending >= PHI_WINDOW_SAMPLES) {
      post({
        type: 'status',
        status: EngineStatus.processing,
        message: 'Redacting PHI window',
      })
      await flushPhiWindow()
    }
  } else {
    output.push(pcm)
  }
}

async function handleFlush(): Promise<void> {
  post({
    type: 'status',
    status: EngineStatus.processing,
    message: 'Finalizing sanitized audio',
  })
  if (options.filterModel) {
    await flushPhiWindow()
  } else if (phiBuffer.length > 0) {
    output.push(concatFloat32(phiBuffer))
    phiBuffer.length = 0
  }
  const samples = concatFloat32(output)
  resetBuffers()
  const copy = new Float32Array(samples)
  post(
    { type: 'complete', samples: copy.buffer as ArrayBuffer, sampleRate: SAMPLE_RATE },
    [copy.buffer as ArrayBuffer],
  )
}

let work = Promise.resolve()

self.onmessage = (event: MessageEvent<WorkerIn>) => {
  const message = event.data
  work = work
    .then(async () => {
      if (message.type === 'configure') {
        options = message.options
        if (!modelsReady || message.options.voiceModel || message.options.filterModel) {
          await ensureModels(message.options)
        } else {
          post({ type: 'status', status: EngineStatus.ready, message: 'Ready' })
        }
        post({ type: 'ready' })
        return
      }
      if (message.type === 'chunk') {
        await handleChunk(new Float32Array(message.samples))
        return
      }
      if (message.type === 'flush') {
        await handleFlush()
        return
      }
      if (message.type === 'wipe') {
        phiMap.wipe()
        resetBuffers()
        post({ type: 'phi', entries: [] })
      }
    })
    .catch((error: unknown) => {
      const errMessage = error instanceof Error ? error.message : 'Transform worker failed'
      post({ type: 'error', message: errMessage })
    })
}
