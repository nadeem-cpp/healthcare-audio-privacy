import { SAMPLE_RATE } from '../types.ts'

const MEL_BINS = 80
const FRAME_MS = 25
const HOP_MS = 10
const FRAME_LEN = Math.round((SAMPLE_RATE * FRAME_MS) / 1000)
const HOP_LEN = Math.round((SAMPLE_RATE * HOP_MS) / 1000)
const N_FFT = 512
const PRE_EMPH = 0.97

let melFilters: Float32Array[] | null = null
let poveyWindow: Float32Array | null = null

export function computeLogMelFbank(pcm: Float32Array): {
  frames: Float32Array
  frameCount: number
} {
  const window = getPoveyWindow()
  const filters = getMelFilters()
  const frameCount = Math.max(0, Math.floor((pcm.length - FRAME_LEN) / HOP_LEN) + 1)
  if (frameCount === 0) {
    return { frames: new Float32Array(0), frameCount: 0 }
  }
  const frames = new Float32Array(frameCount * MEL_BINS)
  const fftIn = new Float32Array(N_FFT)
  const spectrum = new Float32Array(N_FFT / 2 + 1)
  for (let f = 0; f < frameCount; f++) {
    const start = f * HOP_LEN
    let prev = 0
    for (let i = 0; i < FRAME_LEN; i++) {
      const x = pcm[start + i] ?? 0
      const emp = x - PRE_EMPH * prev
      prev = x
      fftIn[i] = emp * window[i]
    }
    fftIn.fill(0, FRAME_LEN)
    magnitudeSpectrum(fftIn, spectrum)
    const dest = f * MEL_BINS
    for (let m = 0; m < MEL_BINS; m++) {
      let energy = 0
      const filter = filters[m]
      for (let k = 0; k < filter.length; k++) {
        energy += spectrum[k] * filter[k]
      }
      frames[dest + m] = Math.log(Math.max(energy, 1e-10))
    }
  }
  meanNormalize(frames, frameCount, MEL_BINS)
  return { frames, frameCount }
}

export function mfccStatisticalEmbedding(
  pcm: Float32Array,
  dim: number,
): Float32Array {
  const { frames, frameCount } = computeLogMelFbank(pcm)
  const stats = new Float32Array(dim)
  if (frameCount === 0) {
    return stats
  }
  const used = Math.min(MEL_BINS, Math.floor(dim / 2))
  const means = new Float32Array(used)
  const vars = new Float32Array(used)
  for (let f = 0; f < frameCount; f++) {
    const base = f * MEL_BINS
    for (let m = 0; m < used; m++) {
      means[m] += frames[base + m]
    }
  }
  for (let m = 0; m < used; m++) {
    means[m] /= frameCount
  }
  for (let f = 0; f < frameCount; f++) {
    const base = f * MEL_BINS
    for (let m = 0; m < used; m++) {
      const d = frames[base + m] - means[m]
      vars[m] += d * d
    }
  }
  for (let m = 0; m < used; m++) {
    stats[m] = means[m]
    stats[used + m] = Math.sqrt(vars[m] / frameCount)
  }
  return l2Normalize(stats)
}

function meanNormalize(frames: Float32Array, frameCount: number, bins: number): void {
  const means = new Float32Array(bins)
  for (let f = 0; f < frameCount; f++) {
    const base = f * bins
    for (let m = 0; m < bins; m++) {
      means[m] += frames[base + m]
    }
  }
  for (let m = 0; m < bins; m++) {
    means[m] /= frameCount
  }
  for (let f = 0; f < frameCount; f++) {
    const base = f * bins
    for (let m = 0; m < bins; m++) {
      frames[base + m] -= means[m]
    }
  }
}

function getPoveyWindow(): Float32Array {
  if (poveyWindow) {
    return poveyWindow
  }
  const w = new Float32Array(FRAME_LEN)
  for (let i = 0; i < FRAME_LEN; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME_LEN - 1))
    w[i] = hann ** 0.85
  }
  poveyWindow = w
  return w
}

function getMelFilters(): Float32Array[] {
  if (melFilters) {
    return melFilters
  }
  const nFreqs = N_FFT / 2 + 1
  const lowMel = hzToMel(20)
  const highMel = hzToMel(SAMPLE_RATE / 2)
  const points = new Float32Array(MEL_BINS + 2)
  for (let i = 0; i < points.length; i++) {
    points[i] = melToHz(lowMel + ((highMel - lowMel) * i) / (MEL_BINS + 1))
  }
  const bins = points.map((hz) => Math.floor(((N_FFT + 1) * hz) / SAMPLE_RATE))
  const filters: Float32Array[] = []
  for (let m = 0; m < MEL_BINS; m++) {
    const filter = new Float32Array(nFreqs)
    const left = bins[m]
    const center = bins[m + 1]
    const right = bins[m + 2]
    for (let k = left; k < center; k++) {
      if (k >= 0 && k < nFreqs && center !== left) {
        filter[k] = (k - left) / (center - left)
      }
    }
    for (let k = center; k < right; k++) {
      if (k >= 0 && k < nFreqs && right !== center) {
        filter[k] = (right - k) / (right - center)
      }
    }
    filters.push(filter)
  }
  melFilters = filters
  return filters
}

function hzToMel(hz: number): number {
  return 1127 * Math.log(1 + hz / 700)
}

function melToHz(mel: number): number {
  return 700 * (Math.exp(mel / 1127) - 1)
}

function magnitudeSpectrum(frame: Float32Array, out: Float32Array): void {
  const n = frame.length
  for (let k = 0; k < out.length; k++) {
    let re = 0
    let im = 0
    const angleStep = (-2 * Math.PI * k) / n
    for (let t = 0; t < n; t++) {
      const a = angleStep * t
      re += frame[t] * Math.cos(a)
      im += frame[t] * Math.sin(a)
    }
    out[k] = re * re + im * im
  }
}

export function l2Normalize(vec: Float32Array): Float32Array {
  let sum = 0
  for (let i = 0; i < vec.length; i++) {
    sum += vec[i] * vec[i]
  }
  const n = Math.sqrt(sum) || 1
  const out = new Float32Array(vec.length)
  for (let i = 0; i < vec.length; i++) {
    out[i] = vec[i] / n
  }
  return out
}

export function cosineDistance(a: Float32Array, b: Float32Array): number {
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
