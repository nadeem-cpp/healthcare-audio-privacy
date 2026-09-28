import * as ort from 'onnxruntime-web'
import { rms } from '../audio/resample.ts'
import { configureOrt } from '../voice/embedding.ts'

const SILERO_URL =
  'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.31/dist/silero_vad_legacy.onnx'
const FRAME_SAMPLES = 1536
const ENERGY_THRESHOLD = 0.012
const SPEECH_PROB = 0.5
const SPEECH_RATIO = 0.28

type SileroSession = {
  session: ort.InferenceSession
  h: ort.Tensor
  c: ort.Tensor
  sr: ort.Tensor
}

let sileroPromise: Promise<SileroSession | null> | null = null

export async function loadVad(): Promise<boolean> {
  const model = await getSilero()
  return model !== null
}

export async function speechRatio(pcm: Float32Array, _sampleRate: number): Promise<number> {
  const model = await getSilero()
  if (!model) {
    return rms(pcm) >= ENERGY_THRESHOLD ? 1 : 0
  }
  resetState(model)
  let voiced = 0
  let total = 0
  for (let i = 0; i + FRAME_SAMPLES <= pcm.length; i += FRAME_SAMPLES) {
    const frame = pcm.subarray(i, i + FRAME_SAMPLES)
    const prob = await inferFrame(model, frame)
    total += 1
    if (prob >= SPEECH_PROB) {
      voiced += 1
    }
  }
  if (total === 0) {
    return rms(pcm) >= ENERGY_THRESHOLD ? 1 : 0
  }
  return voiced / total
}

export async function isVoiced(pcm: Float32Array, sampleRate: number): Promise<boolean> {
  if (rms(pcm) < ENERGY_THRESHOLD) {
    return false
  }
  const ratio = await speechRatio(pcm, sampleRate)
  return ratio >= SPEECH_RATIO
}

async function getSilero(): Promise<SileroSession | null> {
  if (!sileroPromise) {
    sileroPromise = (async () => {
      try {
        configureOrt()
        const response = await fetch(SILERO_URL)
        if (!response.ok) {
          return null
        }
        const buffer = await response.arrayBuffer()
        const session = await ort.InferenceSession.create(buffer, {
          executionProviders: ['wasm'],
        })
        return {
          session,
          ...emptyState(),
        }
      } catch {
        return null
      }
    })()
  }
  return sileroPromise
}

async function inferFrame(model: SileroSession, frame: Float32Array): Promise<number> {
  const input = new ort.Tensor('float32', frame, [1, frame.length])
  const out = await model.session.run({
    input,
    h: model.h,
    c: model.c,
    sr: model.sr,
  })
  model.h = out.hn
  model.c = out.cn
  const data = out.output.data as Float32Array
  return data[0] ?? 0
}

function resetState(model: SileroSession): void {
  const next = emptyState()
  model.h = next.h
  model.c = next.c
  model.sr = next.sr
}

function emptyState(): Pick<SileroSession, 'h' | 'c' | 'sr'> {
  const zeroes = new Float32Array(2 * 64)
  return {
    h: new ort.Tensor('float32', zeroes, [2, 1, 64]),
    c: new ort.Tensor('float32', zeroes.slice(), [2, 1, 64]),
    sr: new ort.Tensor('int64', BigInt64Array.from([16000n])),
  }
}
