import * as ort from 'onnxruntime-web'
import { computeLogMelFbank, l2Normalize, mfccStatisticalEmbedding } from '../audio/fbank.ts'

const MODEL_URL = '/models/ecapa-tdnn.onnx'
const FALLBACK_DIM = 192

let sessionPromise: Promise<ort.InferenceSession | null> | null = null

export function configureOrt(): void {
  ort.env.wasm.numThreads = 1
  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/'
}

export async function loadSpeakerEncoder(): Promise<boolean> {
  const session = await getSession()
  return session !== null
}

export async function extractEmbedding(pcm: Float32Array): Promise<Float32Array> {
  const session = await getSession()
  if (session) {
    try {
      return await runEcapa(session, pcm)
    } catch {
      return mfccStatisticalEmbedding(pcm, FALLBACK_DIM)
    }
  }
  return mfccStatisticalEmbedding(pcm, FALLBACK_DIM)
}

async function getSession(): Promise<ort.InferenceSession | null> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      configureOrt()
      try {
        const res = await fetch(MODEL_URL, { method: 'HEAD' })
        if (!res.ok) {
          return null
        }
        return await ort.InferenceSession.create(MODEL_URL, {
          executionProviders: ['wasm'],
        })
      } catch {
        return null
      }
    })()
  }
  return sessionPromise
}

async function runEcapa(
  session: ort.InferenceSession,
  pcm: Float32Array,
): Promise<Float32Array> {
  const { frames, frameCount } = computeLogMelFbank(pcm)
  if (frameCount < 8) {
    throw new Error('not enough frames for speaker embedding')
  }
  const inputName = session.inputNames[0]
  const attempts: Array<{ data: Float32Array; dims: number[] }> = [
    { data: frames, dims: [1, frameCount, 80] },
    { data: transpose(frames, frameCount, 80), dims: [1, 80, frameCount] },
    { data: pcm, dims: [1, pcm.length] },
  ]
  let lastError: unknown
  for (const attempt of attempts) {
    try {
      const feeds: Record<string, ort.Tensor> = {
        [inputName]: new ort.Tensor('float32', attempt.data, attempt.dims),
      }
      if (session.inputNames.length > 1) {
        const lenName = session.inputNames[1]
        feeds[lenName] = new ort.Tensor('int64', BigInt64Array.from([BigInt(frameCount)]), [1])
      }
      const out = await session.run(feeds)
      const first = out[session.outputNames[0]]
      return l2Normalize(new Float32Array(first.data as Float32Array))
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('ECAPA inference failed')
}

function transpose(frames: Float32Array, rows: number, cols: number): Float32Array {
  const out = new Float32Array(rows * cols)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out[c * rows + r] = frames[r * cols + c]
    }
  }
  return out
}
