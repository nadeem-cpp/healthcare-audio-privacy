export function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate || input.length === 0) {
    return input
  }
  const ratio = fromRate / toRate
  const outLen = Math.max(1, Math.round(input.length / ratio))
  return resampleToLength(input, outLen)
}

export function resampleToLength(
  input: Float32Array,
  outLen: number,
): Float32Array {
  if (outLen === input.length) {
    return input
  }
  if (input.length === 0) {
    return new Float32Array(outLen)
  }
  const out = new Float32Array(outLen)
  const last = input.length - 1
  const scale = last / Math.max(1, outLen - 1)
  for (let i = 0; i < outLen; i++) {
    const src = i * scale
    const i0 = Math.min(last, Math.floor(src))
    const i1 = Math.min(last, i0 + 1)
    const t = src - i0
    out[i] = input[i0] * (1 - t) + input[i1] * t
  }
  return out
}

export function concatFloat32(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Float32Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function rms(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0
  }
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i]
  }
  return Math.sqrt(sum / samples.length)
}
