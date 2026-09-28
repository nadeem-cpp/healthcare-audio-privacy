export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2
  const blockAlign = bytesPerSample
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample)
  const view = new DataView(buffer)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * bytesPerSample, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, samples.length * bytesPerSample, true)
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

export function decodeWav(buffer: ArrayBuffer): {
  samples: Float32Array
  sampleRate: number
} {
  const view = new DataView(buffer)
  if (readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') {
    throw new Error('Not a WAVE file')
  }
  let offset = 12
  let sampleRate = 16000
  let channels = 1
  let bits = 16
  let dataOffset = -1
  let dataSize = 0
  let floatFmt = false
  while (offset + 8 <= view.byteLength) {
    const id = readAscii(view, offset, 4)
    const size = view.getUint32(offset + 4, true)
    const start = offset + 8
    if (id === 'fmt ') {
      const format = view.getUint16(start, true)
      floatFmt = format === 3
      channels = view.getUint16(start + 2, true)
      sampleRate = view.getUint32(start + 4, true)
      bits = view.getUint16(start + 14, true)
    } else if (id === 'data') {
      dataOffset = start
      dataSize = size
      break
    }
    offset = start + size + (size % 2)
  }
  if (dataOffset < 0) {
    throw new Error('WAVE file has no data chunk')
  }
  const frameCount = Math.floor(dataSize / ((bits / 8) * channels))
  const samples = new Float32Array(frameCount)
  if (floatFmt && bits === 32) {
    for (let i = 0; i < frameCount; i++) {
      let mix = 0
      for (let c = 0; c < channels; c++) {
        mix += view.getFloat32(dataOffset + (i * channels + c) * 4, true)
      }
      samples[i] = mix / channels
    }
  } else if (bits === 16) {
    for (let i = 0; i < frameCount; i++) {
      let mix = 0
      for (let c = 0; c < channels; c++) {
        mix += view.getInt16(dataOffset + (i * channels + c) * 2, true) / 0x8000
      }
      samples[i] = mix / channels
    }
  } else {
    throw new Error(`Unsupported WAV format (${bits}-bit)`)
  }
  return { samples, sampleRate }
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i))
  }
}

function readAscii(view: DataView, offset: number, length: number): string {
  let text = ''
  for (let i = 0; i < length; i++) {
    text += String.fromCharCode(view.getUint8(offset + i))
  }
  return text
}
