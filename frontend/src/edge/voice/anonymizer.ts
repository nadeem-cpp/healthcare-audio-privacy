import { EMBED_LOCK_SECONDS, SAMPLE_RATE } from '../types.ts'
import { extractEmbedding } from './embedding.ts'
import { applyVoiceDsp, type DspParams } from './mcadams.ts'
import {
  createPseudoSpeakerBank,
  DEFAULT_DSP,
  selectFarthestSpeaker,
  type PseudoSpeaker,
} from './pseudoSpeakerBank.ts'

export class VoiceAnonymizer {
  #bank = createPseudoSpeakerBank()
  #pending: Float32Array[] = []
  #locked: PseudoSpeaker | null = null
  #collectedSamples = 0

  reset(): void {
    this.#pending = []
    this.#locked = null
    this.#collectedSamples = 0
  }

  lockedSpeakerId(): string | null {
    return this.#locked?.id ?? null
  }

  async anonymize(chunk: Float32Array): Promise<Float32Array> {
    if (!this.#locked) {
      this.#pending.push(chunk)
      this.#collectedSamples += chunk.length
      if (this.#collectedSamples >= EMBED_LOCK_SECONDS * SAMPLE_RATE) {
        await this.#lockFromPending()
      }
    }
    const params = this.#locked?.params ?? DEFAULT_DSP
    return applyVoiceDsp(chunk, params)
  }

  async anonymizeWith(chunk: Float32Array, params: DspParams): Promise<Float32Array> {
    return applyVoiceDsp(chunk, params)
  }

  async #lockFromPending(): Promise<void> {
    const total = this.#pending.reduce((n, p) => n + p.length, 0)
    const joined = new Float32Array(total)
    let offset = 0
    for (const part of this.#pending) {
      joined.set(part, offset)
      offset += part.length
    }
    const live = await extractEmbedding(joined)
    this.#locked = selectFarthestSpeaker(live, this.#bank)
    this.#pending = []
  }
}
