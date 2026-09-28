import { PhiType, type PhiMapEntry } from '../types.ts'

const PREFIX: Record<PhiType, string> = {
  PATIENT: 'PATIENT',
  DATE: 'DATE',
  LOC: 'LOC',
  PHONE: 'PHONE',
  ID: 'ID',
  EMAIL: 'EMAIL',
}

export class PhiMapStore {
  #byKey = new Map<string, PhiMapEntry>()
  #counters: Record<PhiType, number> = {
    PATIENT: 0,
    DATE: 0,
    LOC: 0,
    PHONE: 0,
    ID: 0,
    EMAIL: 0,
  }

  assign(original: string, type: PhiType): string {
    const key = `${type}:${normalizePhi(original)}`
    const existing = this.#byKey.get(key)
    if (existing) {
      return existing.surrogate
    }
    this.#counters[type] += 1
    const surrogate = `${PREFIX[type]}_${String(this.#counters[type]).padStart(2, '0')}`
    this.#byKey.set(key, { original: original.trim(), type, surrogate })
    return surrogate
  }

  list(): PhiMapEntry[] {
    return [...this.#byKey.values()]
  }

  wipe(): void {
    this.#byKey.clear()
    this.#counters = {
      PATIENT: 0,
      DATE: 0,
      LOC: 0,
      PHONE: 0,
      ID: 0,
      EMAIL: 0,
    }
  }
}

export function normalizePhi(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}
