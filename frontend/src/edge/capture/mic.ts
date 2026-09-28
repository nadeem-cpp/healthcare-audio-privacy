import { CHUNK_SAMPLES, SAMPLE_RATE } from '../types.ts'
import { resampleLinear, rms } from '../audio/resample.ts'

const WORKLET_SOURCE = `
class PcmTapProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel && channel.length) {
      this.port.postMessage(channel)
    }
    return true
  }
}
registerProcessor('pcm-tap', PcmTapProcessor)
`

export class MicCapture {
  #context: AudioContext | null = null
  #stream: MediaStream | null = null
  #node: AudioWorkletNode | null = null
  #source: MediaStreamAudioSourceNode | null = null
  #pending: number[] = []
  #workletUrl: string | null = null

  async start(
    onChunk: (pcm: Float32Array) => void,
    onLevel: (value: number) => void,
  ): Promise<void> {
    this.#stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    const context = new AudioContext()
    this.#context = context
    this.#workletUrl = URL.createObjectURL(
      new Blob([WORKLET_SOURCE], { type: 'application/javascript' }),
    )
    await context.audioWorklet.addModule(this.#workletUrl)
    this.#source = context.createMediaStreamSource(this.#stream)
    this.#node = new AudioWorkletNode(context, 'pcm-tap')
    const mute = context.createGain()
    mute.gain.value = 0
    this.#source.connect(this.#node)
    this.#node.connect(mute)
    mute.connect(context.destination)
    this.#node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const native = event.data
      onLevel(rms(native))
      const resampled = resampleLinear(native, context.sampleRate, SAMPLE_RATE)
      for (let i = 0; i < resampled.length; i++) {
        this.#pending.push(resampled[i])
      }
      while (this.#pending.length >= CHUNK_SAMPLES) {
        const slice = this.#pending.splice(0, CHUNK_SAMPLES)
        onChunk(Float32Array.from(slice))
      }
    }
    if (context.state === 'suspended') {
      await context.resume()
    }
  }

  async stop(): Promise<Float32Array | null> {
    const leftover =
      this.#pending.length > 0 ? Float32Array.from(this.#pending) : null
    this.#pending = []
    this.#node?.port.close()
    this.#node?.disconnect()
    this.#source?.disconnect()
    this.#stream?.getTracks().forEach((track) => track.stop())
    if (this.#context) {
      await this.#context.close()
    }
    if (this.#workletUrl) {
      URL.revokeObjectURL(this.#workletUrl)
    }
    this.#node = null
    this.#source = null
    this.#stream = null
    this.#context = null
    this.#workletUrl = null
    return leftover
  }
}
