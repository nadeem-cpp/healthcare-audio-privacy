import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import { pipeline } from '@huggingface/transformers'
import { SAMPLE_RATE } from '../types.ts'

export type AsrWord = {
  text: string
  start: number
  end: number
}

export type AsrResult = {
  text: string
  words: AsrWord[]
}

let asrPromise: Promise<AutomaticSpeechRecognitionPipeline | null> | null = null

export async function loadAsr(): Promise<boolean> {
  const asr = await getAsr()
  return asr !== null
}

export async function transcribe(pcm: Float32Array): Promise<AsrResult> {
  const asr = await getAsr()
  if (!asr || pcm.length < SAMPLE_RATE * 0.4) {
    return { text: '', words: [] }
  }
  const output = await asr(pcm, { return_timestamps: 'word' })
  const result = Array.isArray(output) ? output[0] : output
  const text = (result.text ?? '').trim()
  const chunks = result.chunks ?? []
  const words: AsrWord[] = chunks.map(
    (chunk: { text?: string; timestamp?: [number | null, number | null] }) => {
      const [start, end] = chunk.timestamp ?? [0, 0]
      return {
        text: chunk.text ?? '',
        start: start ?? 0,
        end: end ?? start ?? 0,
      }
    },
  )
  return { text, words }
}

async function getAsr(): Promise<AutomaticSpeechRecognitionPipeline | null> {
  if (!asrPromise) {
    asrPromise = pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny.en',
      { dtype: 'q8' },
    )
      .then((p) => p as AutomaticSpeechRecognitionPipeline)
      .catch(() => null)
  }
  return asrPromise
}
