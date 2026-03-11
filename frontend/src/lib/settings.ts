export const STORAGE_KEYS = {
  connectionMode: 'pwdtimer-connection-mode',
  serialPort: 'pwdtimer-serial-port',
  serialBaudrate: 'pwdtimer-serial-baudrate',
  tcpHost: 'pwdtimer-tcp-host',
  tcpPort: 'pwdtimer-tcp-port',
  autoReconnect: 'pwdtimer-auto-reconnect',

  laneCount: 'pwdtimer-lane-count',
  minValidTimeSec: 'pwdtimer-min-valid-time-sec',
  maxValidTimeSec: 'pwdtimer-max-valid-time-sec',

  soundEnabled: 'pwdtimer-sound-enabled',
  soundVolume: 'pwdtimer-sound-volume',
  soundStartUrl: 'pwdtimer-sound-start-url',
  soundFinishUrl: 'pwdtimer-sound-finish-url',
} as const

export function readString(key: string, defaultValue: string): string {
  try {
    const v = localStorage.getItem(key)
    return v == null ? defaultValue : v
  } catch {
    return defaultValue
  }
}

export function readBool(key: string, defaultValue: boolean): boolean {
  const raw = readString(key, defaultValue ? 'true' : 'false')
  if (raw === 'true') return true
  if (raw === 'false') return false
  return defaultValue
}

export function clampNumber(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, v))
}

export function readNumber(key: string, defaultValue: number, opts?: { min?: number; max?: number; integer?: boolean }): number {
  const raw = readString(key, String(defaultValue))
  let n = Number(raw)
  if (!Number.isFinite(n)) n = defaultValue
  if (opts?.integer) n = Math.trunc(n)
  if (opts?.min != null || opts?.max != null) {
    n = clampNumber(n, opts?.min ?? n, opts?.max ?? n)
  }
  return n
}

export function writeValue(key: string, value: string | number | boolean | null | undefined) {
  try {
    if (value == null) {
      localStorage.removeItem(key)
      return
    }
    localStorage.setItem(key, String(value))
  } catch {
    // ignore
  }
}
