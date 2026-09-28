import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'public', 'models', 'ecapa-tdnn.onnx')
const url =
  'https://huggingface.co/Wespeaker/wespeaker-voxceleb-ecapa-tdnn512/resolve/main/voxceleb_ECAPA512.onnx'

await mkdir(dirname(dest), { recursive: true })
console.log(`Downloading ${url}`)
const response = await fetch(url, {
  headers: { 'User-Agent': 'healthcare-audio-privacy-fetch-models' },
  redirect: 'follow',
})
if (!response.ok) {
  throw new Error(`Failed to download ECAPA model: ${response.status} ${response.statusText}`)
}
const bytes = new Uint8Array(await response.arrayBuffer())
await writeFile(dest, bytes)
console.log(`Wrote ${dest} (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB)`)
