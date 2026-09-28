import type { DspParams } from './mcadams.ts'

export type PseudoSpeaker = {
  id: string
  embedding: Float32Array
  params: DspParams
}

const EMBED_DIM = 512

export const DEFAULT_DSP: DspParams = {
  mcadamsAlpha: 0.82,
  f0ShiftSemitones: 2.5,
  formantWarp: 1.08,
}

export function createPseudoSpeakerBank(): PseudoSpeaker[] {
  const specs: Array<DspParams & { seed: number }> = [
    { seed: 11, mcadamsAlpha: 0.72, f0ShiftSemitones: -4.5, formantWarp: 0.88 },
    { seed: 23, mcadamsAlpha: 0.78, f0ShiftSemitones: -3.0, formantWarp: 0.92 },
    { seed: 37, mcadamsAlpha: 0.84, f0ShiftSemitones: -1.5, formantWarp: 0.96 },
    { seed: 41, mcadamsAlpha: 0.88, f0ShiftSemitones: 1.2, formantWarp: 1.05 },
    { seed: 53, mcadamsAlpha: 0.92, f0ShiftSemitones: 2.4, formantWarp: 1.1 },
    { seed: 67, mcadamsAlpha: 1.08, f0ShiftSemitones: 3.6, formantWarp: 1.14 },
    { seed: 71, mcadamsAlpha: 1.14, f0ShiftSemitones: 4.8, formantWarp: 1.18 },
    { seed: 83, mcadamsAlpha: 0.76, f0ShiftSemitones: 5.2, formantWarp: 0.86 },
    { seed: 97, mcadamsAlpha: 1.18, f0ShiftSemitones: -5.0, formantWarp: 1.12 },
    { seed: 101, mcadamsAlpha: 0.7, f0ShiftSemitones: 0.8, formantWarp: 1.2 },
    { seed: 127, mcadamsAlpha: 1.22, f0ShiftSemitones: -2.2, formantWarp: 0.84 },
    { seed: 149, mcadamsAlpha: 0.8, f0ShiftSemitones: 3.1, formantWarp: 0.9 },
  ]
  return specs.map((spec, i) => ({
    id: `pseudo_${String(i + 1).padStart(2, '0')}`,
    embedding: seededUnitVector(spec.seed, EMBED_DIM),
    params: {
      mcadamsAlpha: spec.mcadamsAlpha,
      f0ShiftSemitones: spec.f0ShiftSemitones,
      formantWarp: spec.formantWarp,
    },
  }))
}

export function selectFarthestSpeaker(
  live: Float32Array,
  bank: PseudoSpeaker[],
): PseudoSpeaker {
  let best = bank[0]
  let bestDist = -1
  for (const speaker of bank) {
    const dist = cosineDistanceTrim(live, speaker.embedding)
    if (dist > bestDist) {
      bestDist = dist
      best = speaker
    }
  }
  return best
}

function cosineDistanceTrim(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length)
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  if (denom === 0) {
    return 1
  }
  return 1 - dot / denom
}

function seededUnitVector(seed: number, dim: number): Float32Array {
  const vec = new Float32Array(dim)
  let s = seed >>> 0
  for (let i = 0; i < dim; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    vec[i] = s / 0xffffffff - 0.5
  }
  let sum = 0
  for (let i = 0; i < dim; i++) {
    sum += vec[i] * vec[i]
  }
  const n = Math.sqrt(sum) || 1
  for (let i = 0; i < dim; i++) {
    vec[i] /= n
  }
  return vec
}
