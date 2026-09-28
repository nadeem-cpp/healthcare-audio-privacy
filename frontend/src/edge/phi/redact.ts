import { SAMPLE_RATE, type PhiEntity } from '../types.ts'
import type { AsrWord } from './asr.ts'
import type { DetectedSpan } from './ner.ts'
import { PhiMapStore } from './phiMap.ts'

const PAD_SECONDS = 0.05

export function spansToEntities(
  spans: DetectedSpan[],
  words: AsrWord[],
  windowSeconds: number,
  store: PhiMapStore,
): PhiEntity[] {
  return spans.map((span) => {
    const time = alignSpan(span, words, windowSeconds)
    return {
      type: span.type,
      original: span.text.trim(),
      surrogate: store.assign(span.text, span.type),
      start: time.start,
      end: time.end,
    }
  })
}

export function muteEntities(samples: Float32Array, entities: PhiEntity[]): Float32Array {
  if (entities.length === 0) {
    return samples
  }
  const out = samples.slice()
  for (const entity of entities) {
    const start = Math.max(0, Math.floor((entity.start - PAD_SECONDS) * SAMPLE_RATE))
    const end = Math.min(
      out.length,
      Math.ceil((entity.end + PAD_SECONDS) * SAMPLE_RATE),
    )
    const toneLen = Math.min(end - start, Math.round(0.04 * SAMPLE_RATE))
    for (let i = start; i < end; i++) {
      out[i] = 0
    }
    for (let i = 0; i < toneLen; i++) {
      out[start + i] = Math.sin((2 * Math.PI * 880 * i) / SAMPLE_RATE) * 0.12
    }
  }
  return out
}

function alignSpan(
  span: DetectedSpan,
  words: AsrWord[],
  windowSeconds: number,
): { start: number; end: number } {
  if (words.length === 0) {
    return { start: 0, end: windowSeconds }
  }
  const needle = normalize(span.text)
  const hits = words.filter((word) => {
    const token = normalize(word.text)
    return token.length > 0 && (needle.includes(token) || token.includes(needle))
  })
  if (hits.length === 0) {
    const last = words[words.length - 1]
    return { start: words[0].start, end: last.end || windowSeconds }
  }
  return {
    start: hits[0].start,
    end: hits[hits.length - 1].end,
  }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}
