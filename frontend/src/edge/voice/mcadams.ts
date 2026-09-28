import { resampleToLength } from '../audio/resample.ts'

const LPC_ORDER = 16
const FRAME_LEN = 400
const HOP_LEN = 200
const PRE_EMPH = 0.97

type Complex = { re: number; im: number }

export type DspParams = {
  mcadamsAlpha: number
  f0ShiftSemitones: number
  formantWarp: number
}

export function applyVoiceDsp(samples: Float32Array, params: DspParams): Float32Array {
  let out = applyMcadams(samples, params.mcadamsAlpha)
  if (params.formantWarp !== 1) {
    out = warpFormants(out, params.formantWarp)
  }
  if (params.f0ShiftSemitones !== 0) {
    out = shiftPitch(out, params.f0ShiftSemitones)
  }
  return clipUnit(out)
}

export function applyMcadams(samples: Float32Array, alpha: number): Float32Array {
  if (samples.length < FRAME_LEN || Math.abs(alpha - 1) < 1e-3) {
    return samples
  }
  const window = hamming(FRAME_LEN)
  const out = new Float32Array(samples.length)
  const weight = new Float32Array(samples.length)
  const frame = new Float32Array(FRAME_LEN)
  for (let start = 0; start + FRAME_LEN <= samples.length; start += HOP_LEN) {
    let prev = start > 0 ? samples[start - 1] : 0
    for (let i = 0; i < FRAME_LEN; i++) {
      const x = samples[start + i]
      frame[i] = (x - PRE_EMPH * prev) * window[i]
      prev = x
    }
    const shifted = mcadamsFrame(frame, alpha)
    for (let i = 0; i < FRAME_LEN; i++) {
      out[start + i] += shifted[i] * window[i]
      weight[start + i] += window[i] * window[i]
    }
  }
  for (let i = 0; i < out.length; i++) {
    out[i] = weight[i] > 1e-6 ? out[i] / weight[i] : samples[i]
  }
  return out
}

export function shiftPitch(samples: Float32Array, semitones: number): Float32Array {
  if (semitones === 0 || samples.length === 0) {
    return samples
  }
  const ratio = 2 ** (semitones / 12)
  const pitchedLen = Math.max(1, Math.round(samples.length / ratio))
  const pitched = resampleToLength(samples, pitchedLen)
  return resampleToLength(pitched, samples.length)
}

export function warpFormants(samples: Float32Array, warp: number): Float32Array {
  if (Math.abs(warp - 1) < 1e-3 || samples.length < 64) {
    return samples
  }
  const n = nextPow2(Math.min(2048, samples.length))
  const out = new Float32Array(samples.length)
  const window = hamming(n)
  const hop = n >> 1
  const weight = new Float32Array(samples.length)
  for (let start = 0; start + n <= samples.length; start += hop) {
    const re = new Float32Array(n)
    const im = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      re[i] = samples[start + i] * window[i]
    }
    fft(re, im, false)
    const wre = new Float32Array(n)
    const wim = new Float32Array(n)
    const nyquist = n / 2
    for (let k = 0; k <= nyquist; k++) {
      const src = Math.min(nyquist, k / warp)
      const i0 = Math.floor(src)
      const i1 = Math.min(nyquist, i0 + 1)
      const t = src - i0
      wre[k] = re[i0] * (1 - t) + re[i1] * t
      wim[k] = im[i0] * (1 - t) + im[i1] * t
      if (k > 0 && k < nyquist) {
        wre[n - k] = wre[k]
        wim[n - k] = -wim[k]
      }
    }
    fft(wre, wim, true)
    for (let i = 0; i < n; i++) {
      out[start + i] += wre[i] * window[i]
      weight[start + i] += window[i] * window[i]
    }
  }
  for (let i = 0; i < out.length; i++) {
    out[i] = weight[i] > 1e-6 ? out[i] / weight[i] : samples[i]
  }
  return out
}

function mcadamsFrame(frame: Float32Array, alpha: number): Float32Array {
  const fallback = spectralWarpFrame(frame, alpha)
  const r = autocorrelation(frame, LPC_ORDER)
  const a = levinsonDurbin(r, LPC_ORDER)
  if (!a) {
    return fallback
  }
  const poles = polynomialRoots(a)
  if (!poles) {
    return fallback
  }
  const shifted = poles.map((p) => shiftPole(p, alpha))
  const aNew = polesToLpc(shifted)
  const residual = inverseFilter(frame, a)
  const synthesized = synthesize(residual, aNew)
  if (!isStable(frame, synthesized)) {
    return fallback
  }
  return synthesized
}

function isStable(input: Float32Array, output: Float32Array): boolean {
  let inE = 0
  let outE = 0
  for (let i = 0; i < input.length; i++) {
    if (!Number.isFinite(output[i])) {
      return false
    }
    inE += input[i] * input[i]
    outE += output[i] * output[i]
  }
  if (outE > inE * 6 || outE < inE * 0.05) {
    return false
  }
  return true
}

function clipUnit(samples: Float32Array): Float32Array {
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]
    out[i] = Number.isFinite(x) ? Math.max(-0.98, Math.min(0.98, x)) : 0
  }
  return out
}

function shiftPole(p: Complex, alpha: number): Complex {
  const mag = Math.min(0.99, Math.hypot(p.re, p.im))
  const theta = Math.atan2(p.im, p.re)
  if (Math.abs(theta) < 0.02) {
    return { re: mag * Math.sign(p.re || 1), im: 0 }
  }
  const newTheta = Math.sign(theta) * Math.abs(theta) ** alpha
  return { re: mag * Math.cos(newTheta), im: mag * Math.sin(newTheta) }
}

function autocorrelation(x: Float32Array, order: number): Float32Array {
  const r = new Float32Array(order + 1)
  for (let k = 0; k <= order; k++) {
    let sum = 0
    for (let n = 0; n < x.length - k; n++) {
      sum += x[n] * x[n + k]
    }
    r[k] = sum
  }
  return r
}

function levinsonDurbin(r: Float32Array, order: number): Float32Array | null {
  if (r[0] < 1e-12) {
    return null
  }
  const a = new Float32Array(order + 1)
  a[0] = 1
  let err = r[0]
  for (let i = 1; i <= order; i++) {
    let acc = r[i]
    for (let j = 1; j < i; j++) {
      acc += a[j] * r[i - j]
    }
    const k = -acc / err
    if (!Number.isFinite(k) || Math.abs(k) >= 1) {
      return null
    }
    const next = a.slice()
    next[i] = k
    for (let j = 1; j < i; j++) {
      next[j] = a[j] + k * a[i - j]
    }
    a.set(next)
    err *= 1 - k * k
  }
  return a
}

function inverseFilter(x: Float32Array, a: Float32Array): Float32Array {
  const e = new Float32Array(x.length)
  for (let n = 0; n < x.length; n++) {
    let acc = x[n]
    for (let k = 1; k < a.length; k++) {
      if (n - k >= 0) {
        acc += a[k] * x[n - k]
      }
    }
    e[n] = acc
  }
  return e
}

function synthesize(e: Float32Array, a: Float32Array): Float32Array {
  const y = new Float32Array(e.length)
  for (let n = 0; n < e.length; n++) {
    let acc = e[n]
    for (let k = 1; k < a.length; k++) {
      if (n - k >= 0) {
        acc -= a[k] * y[n - k]
      }
    }
    y[n] = acc
  }
  return y
}

function polesToLpc(poles: Complex[]): Float32Array {
  let coeffs: Complex[] = [{ re: 1, im: 0 }]
  for (const p of poles) {
    const next: Complex[] = Array.from({ length: coeffs.length + 1 }, () => ({
      re: 0,
      im: 0,
    }))
    for (let i = 0; i < coeffs.length; i++) {
      next[i] = add(next[i], coeffs[i])
      next[i + 1] = add(next[i + 1], mul(coeffs[i], { re: -p.re, im: -p.im }))
    }
    coeffs = next
  }
  const a = new Float32Array(coeffs.length)
  const scale = coeffs[0].re || 1
  for (let i = 0; i < coeffs.length; i++) {
    a[i] = coeffs[i].re / scale
  }
  return a
}

function polynomialRoots(a: Float32Array): Complex[] | null {
  const coeffs = Array.from(a, (re) => ({ re, im: 0 }))
  const roots: Complex[] = []
  const work = coeffs.slice()
  while (work.length > 1) {
    const root = laguerre(work, { re: 0.4, im: 0.9 })
    if (!root) {
      return null
    }
    roots.push(root)
    deflate(work, root)
  }
  return roots
}

function laguerre(poly: Complex[], guess: Complex): Complex | null {
  let x = guess
  const n = poly.length - 1
  for (let iter = 0; iter < 80; iter++) {
    let p = { re: 0, im: 0 }
    let dp = { re: 0, im: 0 }
    let d2 = { re: 0, im: 0 }
    for (const c of poly) {
      d2 = add(mul(d2, x), mul(dp, { re: 2, im: 0 }))
      dp = add(mul(dp, x), p)
      p = add(mul(p, x), c)
    }
    if (abs(p) < 1e-12) {
      return x
    }
    const g = div(dp, p)
    const g2 = mul(g, g)
    const h = sub(g2, div(d2, p))
    const disc = scale(sqrtC(scale(sub(scale(h, n), g2), n - 1)), 1)
    const gp = add(g, disc)
    const gm = sub(g, disc)
    const den = abs(gp) > abs(gm) ? gp : gm
    if (abs(den) < 1e-16) {
      x = add(x, { re: 0.01, im: 0.01 })
      continue
    }
    const dx = div({ re: n, im: 0 }, den)
    x = sub(x, dx)
    if (abs(dx) < 1e-10) {
      return x
    }
  }
  return abs(x) < 2 ? x : null
}

function deflate(poly: Complex[], root: Complex): void {
  let carry = poly[0]
  const next = [poly[0]]
  for (let i = 1; i < poly.length - 1; i++) {
    carry = add(poly[i], mul(carry, root))
    next.push(carry)
  }
  poly.length = 0
  poly.push(...next)
}

function spectralWarpFrame(frame: Float32Array, alpha: number): Float32Array {
  const n = nextPow2(frame.length)
  const re = new Float32Array(n)
  const im = new Float32Array(n)
  re.set(frame)
  fft(re, im, false)
  const wre = new Float32Array(n)
  const wim = new Float32Array(n)
  const nyquist = n / 2
  const warp = alpha
  for (let k = 0; k <= nyquist; k++) {
    const src = Math.min(nyquist, ((k / nyquist) ** warp) * nyquist)
    const i0 = Math.floor(src)
    const i1 = Math.min(nyquist, i0 + 1)
    const t = src - i0
    wre[k] = re[i0] * (1 - t) + re[i1] * t
    wim[k] = im[i0] * (1 - t) + im[i1] * t
    if (k > 0 && k < nyquist) {
      wre[n - k] = wre[k]
      wim[n - k] = -wim[k]
    }
  }
  fft(wre, wim, true)
  return wre.slice(0, frame.length)
}

function hamming(n: number): Float32Array {
  const w = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1))
  }
  return w
}

function nextPow2(n: number): number {
  let p = 1
  while (p < n) {
    p <<= 1
  }
  return p
}

function fft(re: Float32Array, im: Float32Array, inverse: boolean): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) {
      j ^= bit
    }
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len
    const wlenRe = Math.cos(ang)
    const wlenIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let wr = 1
      let wi = 0
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j]
        const uIm = im[i + j]
        const vRe = re[i + j + len / 2] * wr - im[i + j + len / 2] * wi
        const vIm = re[i + j + len / 2] * wi + im[i + j + len / 2] * wr
        re[i + j] = uRe + vRe
        im[i + j] = uIm + vIm
        re[i + j + len / 2] = uRe - vRe
        im[i + j + len / 2] = uIm - vIm
        const nwr = wr * wlenRe - wi * wlenIm
        wi = wr * wlenIm + wi * wlenRe
        wr = nwr
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n
      im[i] /= n
    }
  }
}

function add(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im }
}
function sub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im }
}
function mul(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }
}
function div(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im || 1e-16
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }
}
function scale(a: Complex, s: number): Complex {
  return { re: a.re * s, im: a.im * s }
}
function abs(a: Complex): number {
  return Math.hypot(a.re, a.im)
}
function sqrtC(a: Complex): Complex {
  const r = abs(a)
  return { re: Math.sqrt(Math.max(0, r + a.re) / 2), im: Math.sign(a.im) * Math.sqrt(Math.max(0, r - a.re) / 2) }
}
