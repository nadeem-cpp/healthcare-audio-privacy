import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const major = Number(process.versions.node.split('.')[0])

function supported(versionMajor) {
  return versionMajor === 20 || versionMajor === 22
}

function findNode20() {
  const nvmDir = process.env.NVM_DIR || path.join(os.homedir(), '.nvm')
  const versionsDir = path.join(nvmDir, 'versions', 'node')
  if (!fs.existsSync(versionsDir)) return null
  const match = fs
    .readdirSync(versionsDir)
    .filter((name) => /^v20\.\d+\.\d+$/.test(name))
    .sort()
    .at(-1)
  return match ? path.join(versionsDir, match, 'bin', 'node') : null
}

function run(nodePath, args) {
  const child = spawn(nodePath, args, { stdio: 'inherit', env: process.env })
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal)
    else process.exit(code ?? 1)
  })
}

if (!supported(major) && !process.env.HAP_NODE_PINNED) {
  const node20 = findNode20()
  if (!node20) {
    console.error('This frontend needs Node 20 or 22. Current:', process.version)
    console.error('Run: nvm use 20')
    process.exit(1)
  }
  process.env.HAP_NODE_PINNED = '1'
  run(node20, [path.resolve(import.meta.dirname, 'run-dev.mjs'), ...process.argv.slice(2)])
} else {
  const viteBin = path.resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js')
  if (!fs.existsSync(viteBin)) {
    console.error('Vite binary not found at', viteBin)
    process.exit(1)
  }
  run(process.execPath, [viteBin, ...process.argv.slice(2)])
}
