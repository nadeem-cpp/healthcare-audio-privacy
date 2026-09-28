import type { TokenClassificationPipeline } from '@huggingface/transformers'
import { pipeline } from '@huggingface/transformers'
import { PhiType } from '../types.ts'

export type DetectedSpan = {
  type: PhiType
  text: string
  start: number
  end: number
}

const NER_LABEL: Record<string, PhiType> = {
  PER: 'PATIENT',
  PERSON: 'PATIENT',
  LOC: 'LOC',
  LOCATION: 'LOC',
  ORG: 'LOC',
  GPE: 'LOC',
}

const PATTERNS: Array<{ type: PhiType; regex: RegExp }> = [
  {
    type: 'EMAIL',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  { type: 'PHONE', regex: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g },
  {
    type: 'PHONE',
    regex:
      /(?:\b(?:one|two|three|four|five|six|seven|eight|nine|zero|oh)\b[\s,-]*){7,11}/gi,
  },
  { type: 'ID', regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  {
    type: 'ID',
    regex: /\b(?:mrn|medical record(?: number)?|record number)[:\s#]*[A-Z0-9-]{4,}\b/gi,
  },
  {
    type: 'DATE',
    regex:
      /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{2,4})?\b/gi,
  },
  { type: 'DATE', regex: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g },
  { type: 'DATE', regex: /\b(?:19|20)\d{2}\b/g },
]

let nerPromise: Promise<TokenClassificationPipeline | null> | null = null

export async function loadNer(): Promise<boolean> {
  const ner = await getNer()
  return ner !== null
}

export function detectRegexPhi(text: string): DetectedSpan[] {
  return detectRegex(text)
}

export async function detectPhi(text: string): Promise<DetectedSpan[]> {
  const spans = detectRegexPhi(text)
  const ner = await getNer()
  if (ner && text.trim()) {
    try {
      const raw = await ner(text, { aggregation_strategy: 'simple' })
      const items = Array.isArray(raw) ? raw : [raw]
      for (const item of items) {
        const row = item as {
          entity_group?: string
          entity?: string
          word?: string
          start?: number
          end?: number
        }
        const label = (row.entity_group ?? row.entity ?? '').replace(/^B-|^I-/, '')
        const type = NER_LABEL[label.toUpperCase()]
        if (!type || !row.word) {
          continue
        }
        spans.push({
          type,
          text: row.word.replace(/^##/, ''),
          start: row.start ?? 0,
          end: row.end ?? (row.start ?? 0) + row.word.length,
        })
      }
    } catch {
      // regex-only fallback remains
    }
  }
  return mergeSpans(spans, text)
}

async function getNer(): Promise<TokenClassificationPipeline | null> {
  if (!nerPromise) {
    nerPromise = pipeline('token-classification', 'Xenova/bert-base-NER', {
      dtype: 'q8',
    })
      .then((p) => p as TokenClassificationPipeline)
      .catch(() => null)
  }
  return nerPromise
}

function detectRegex(text: string): DetectedSpan[] {
  const spans: DetectedSpan[] = []
  for (const { type, regex } of PATTERNS) {
    const copy = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`)
    let match: RegExpExecArray | null
    while ((match = copy.exec(text)) !== null) {
      spans.push({
        type,
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
      })
    }
  }
  return spans
}

function mergeSpans(spans: DetectedSpan[], text: string): DetectedSpan[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end)
  const out: DetectedSpan[] = []
  for (const span of sorted) {
    const clipped = {
      ...span,
      start: Math.max(0, span.start),
      end: Math.min(text.length, span.end),
    }
    if (clipped.end <= clipped.start) {
      continue
    }
    clipped.text = text.slice(clipped.start, clipped.end)
    const last = out[out.length - 1]
    if (last && clipped.start < last.end) {
      if (clipped.end > last.end) {
        last.end = clipped.end
        last.text = text.slice(last.start, last.end)
      }
      continue
    }
    out.push(clipped)
  }
  return out
}
