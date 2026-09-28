import { SAMPLE_RATE } from '../types.ts'

export function synthesizeTestClip(seconds = 6): Float32Array {
  const length = Math.round(seconds * SAMPLE_RATE)
  const out = new Float32Array(length)
  const phrases = [
    { f0: 110, formants: [700, 1200, 2600], gain: 0.18 },
    { f0: 140, formants: [400, 2000, 2550], gain: 0.16 },
    { f0: 180, formants: [300, 2200, 3000], gain: 0.14 },
  ]
  const slice = Math.floor(length / phrases.length)
  for (let p = 0; p < phrases.length; p++) {
    const { f0, formants, gain } = phrases[p]
    const start = p * slice
    const end = p === phrases.length - 1 ? length : start + slice
    const states = formants.map(() => ({ y1: 0, y2: 0 }))
    let phase = 0
    for (let i = start; i < end; i++) {
      const t = (i - start) / SAMPLE_RATE
      const env = Math.min(1, t * 8) * Math.min(1, (end - i) / SAMPLE_RATE * 8)
      phase += f0 / SAMPLE_RATE
      const pulse = phase % 1 < 0.08 ? 1 : 0
      let x = (pulse * 2 - 0.15) * gain * env
      for (let k = 0; k < formants.length; k++) {
        const r = 0.96
        const omega = (2 * Math.PI * formants[k]) / SAMPLE_RATE
        const a1 = -2 * r * Math.cos(omega)
        const a2 = r * r
        const y = x - a1 * states[k].y1 - a2 * states[k].y2
        states[k].y2 = states[k].y1
        states[k].y1 = y
        x = y
      }
      out[i] = Math.max(-0.95, Math.min(0.95, x))
    }
  }
  return out
}
