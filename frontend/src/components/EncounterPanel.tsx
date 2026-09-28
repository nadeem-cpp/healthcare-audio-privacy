import { useEffect, useRef, useState } from 'react'
import { synthesizeTestClip } from '../edge/audio/synth.ts'
import { decodeWav } from '../edge/audio/wav.ts'
import { resampleLinear } from '../edge/audio/resample.ts'
import { EdgeEngine } from '../edge/engine.ts'
import {
  EngineStatus,
  SAMPLE_RATE,
  type EngineStatus as Status,
  type PhiMapEntry,
} from '../edge/types.ts'

export function EncounterPanel() {
  const [voiceModel, setVoiceModel] = useState(false)
  const [filterModel, setFilterModel] = useState(false)
  const [status, setStatus] = useState<Status>(EngineStatus.idle)
  const [statusMessage, setStatusMessage] = useState('Idle')
  const [level, setLevel] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [phiEntries, setPhiEntries] = useState<PhiMapEntry[]>([])
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const engineRef = useRef<EdgeEngine | null>(null)
  const audioUrlRef = useRef<string | null>(null)

  useEffect(() => {
    const engine = new EdgeEngine()
    engineRef.current = engine
    const off = engine.on((event) => {
      if (event.type === 'status') {
        setStatus(event.status)
        if (event.message) {
          setStatusMessage(event.message)
        }
      } else if (event.type === 'level') {
        setLevel(event.rms)
      } else if (event.type === 'progress') {
        setSeconds(event.seconds)
      } else if (event.type === 'phi' && event.entries.length > 0) {
        setPhiEntries(event.entries)
      } else if (event.type === 'error') {
        setError(event.message)
      }
    })
    const wipeOnHide = () => {
      if (document.visibilityState === 'hidden') {
        engine.wipe()
        setPhiEntries([])
      }
    }
    document.addEventListener('visibilitychange', wipeOnHide)
    return () => {
      off()
      document.removeEventListener('visibilitychange', wipeOnHide)
      engine.dispose()
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (recording) {
      engineRef.current?.setOptions({ voiceModel, filterModel })
    }
  }, [voiceModel, filterModel, recording])

  const setPlayback = (samples: Float32Array) => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
    }
    const url = engine.toWavUrl(samples)
    audioUrlRef.current = url
    setAudioUrl(url)
  }

  const startEncounter = async () => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    setError(null)
    setPhiEntries([])
    setSeconds(0)
    setBusy(true)
    try {
      await engine.start({ voiceModel, filterModel })
      setRecording(true)
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      const raw = err instanceof Error ? err.message : 'Microphone access failed'
      setError(
        name === 'NotAllowedError' || name === 'NotFoundError'
          ? 'Microphone unavailable in this browser session. Use a test clip or WAV file, or allow the mic and try again.'
          : raw,
      )
      setStatus(EngineStatus.error)
    } finally {
      setBusy(false)
    }
  }

  const stopEncounter = async () => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    setBusy(true)
    try {
      const samples = await engine.stop()
      setPlayback(samples)
      engine.wipe()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to finalize audio')
    } finally {
      setRecording(false)
      setBusy(false)
      setLevel(0)
    }
  }

  const runBuffer = async (samples: Float32Array) => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    setError(null)
    setBusy(true)
    try {
      const result = await engine.processPcm(samples, { voiceModel, filterModel })
      setPlayback(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed')
    } finally {
      setBusy(false)
    }
  }

  const onWav = async (file: File | undefined) => {
    if (!file) {
      return
    }
    try {
      const { samples, sampleRate } = decodeWav(await file.arrayBuffer())
      await runBuffer(resampleLinear(samples, sampleRate, SAMPLE_RATE))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read WAV')
    }
  }

  const clearSession = () => {
    engineRef.current?.wipe()
    setError(null)
    setPhiEntries([])
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
    setAudioUrl(null)
    setSeconds(0)
    setStatus(EngineStatus.idle)
    setStatusMessage('Session cleared')
  }

  const toggleDisabled = busy

  return (
    <div className="encounter">
      <header className="encounter-header">
        <p className="eyebrow">On-device edge engine</p>
        <h1>Voice and PHI transform</h1>
        <p className="lede">
          Raw audio and the PHI map stay in this tab. Only sanitized audio is
          produced for later cloud use.
        </p>
      </header>

      <section className="panel">
        <div className="toggle-row">
          <label className={`toggle ${voiceModel ? 'on' : ''}`}>
            <span>Voice anonymization</span>
            <button
              type="button"
              disabled={toggleDisabled && !recording}
              onClick={() => setVoiceModel((value) => !value)}
            >
              {voiceModel ? 'On' : 'Off'}
            </button>
          </label>
          <label className={`toggle ${filterModel ? 'on' : ''}`}>
            <span>PHI filter</span>
            <button
              type="button"
              disabled={toggleDisabled && !recording}
              onClick={() => setFilterModel((value) => !value)}
            >
              {filterModel ? 'On' : 'Off'}
            </button>
          </label>
        </div>

        <div className="status-row">
          <span className={`pill ${status}`}>{status}</span>
          <span>{statusMessage}</span>
          <span className="mono">{seconds.toFixed(1)}s</span>
        </div>

        <div className="meter" aria-hidden="true">
          <div className="meter-fill" style={{ width: `${Math.min(100, level * 400)}%` }} />
        </div>

        <div className="actions">
          {!recording ? (
            <button type="button" className="primary" disabled={busy} onClick={startEncounter}>
              Start encounter
            </button>
          ) : (
            <button type="button" className="danger" disabled={busy} onClick={stopEncounter}>
              Stop
            </button>
          )}
          <button
            type="button"
            disabled={busy || recording}
            onClick={() => void runBuffer(synthesizeTestClip())}
          >
            Use test clip
          </button>
          <label className="file-btn">
            Load WAV
            <input
              type="file"
              accept="audio/wav,.wav"
              disabled={busy || recording}
              onChange={(event) => void onWav(event.target.files?.[0])}
            />
          </label>
          <button type="button" disabled={busy || recording} onClick={clearSession}>
            Wipe session
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="panel">
        <h2>Sanitized playback</h2>
        {audioUrl ? (
          <audio controls src={audioUrl} />
        ) : (
          <p className="muted">No sanitized recording yet.</p>
        )}
      </section>

      <section className="panel">
        <h2>PHI map (RAM only)</h2>
        {phiEntries.length === 0 ? (
          <p className="muted">No surrogates in this session.</p>
        ) : (
          <table className="phi-table">
            <thead>
              <tr>
                <th>Surrogate</th>
                <th>Original</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {phiEntries.map((entry) => (
                <tr key={entry.surrogate}>
                  <td>
                    <code>{entry.surrogate}</code>
                  </td>
                  <td>{entry.original}</td>
                  <td>{entry.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
