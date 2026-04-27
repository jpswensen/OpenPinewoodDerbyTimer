import { useCallback, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { useToast } from '../components/ui/Toast'

import { ApiError } from '../api/client'
import {
  connectTimer,
  disconnectTimer,
  discoverMdns,
  getConnectionStatus,
  listSerialPorts,
  resetAllData,
  setTimerLanes,
  toggleSerialMonitor,
  type ConnectionStatus,
  type MdnsDiscoveryResponse,
} from '../api/endpoints/connection'
import { useTheme } from '../context/theme'
import { cn } from '../lib/cn'
import { STORAGE_KEYS, clampNumber, readBool, readNumber, readString, writeValue } from '../lib/settings'
import { useWebSocket } from '../hooks/useWebSocket'

type ConnMode = 'serial' | 'tcp'

function statusPill(status: ConnectionStatus['connection_state'] | undefined) {
  const base = 'inline-flex rounded-full px-3 py-1 text-xs font-semibold'
  if (status === 'connected') return <span className={cn(base, 'bg-emerald-500 text-white')}>Connected</span>
  if (status === 'connecting') return <span className={cn(base, 'bg-amber-400 text-slate-950')}>Connecting</span>
  return <span className={cn(base, 'bg-slate-300 text-slate-950 dark:bg-slate-700 dark:text-slate-50')}>Disconnected</span>
}

export function SettingsPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { mode: themeMode, setMode: setThemeMode } = useTheme()

  const [connMode, setConnMode] = useState<ConnMode>(() => {
    const v = readString(STORAGE_KEYS.connectionMode, 'tcp')
    return v === 'serial' ? 'serial' : 'tcp'
  })
  const [serialPort, setSerialPort] = useState(() => readString(STORAGE_KEYS.serialPort, ''))
  const [baudrate, setBaudrate] = useState(() => readNumber(STORAGE_KEYS.serialBaudrate, 115200, { min: 1200, max: 921600, integer: true }))
  const [tcpHost, setTcpHost] = useState(() => readString(STORAGE_KEYS.tcpHost, 'pwdtimer.local'))
  const [tcpPort, setTcpPort] = useState(() => readNumber(STORAGE_KEYS.tcpPort, 8080, { min: 1, max: 65535, integer: true }))
  const [autoReconnect, setAutoReconnect] = useState(() => readBool(STORAGE_KEYS.autoReconnect, true))

  const [laneCount, setLaneCount] = useState(() => readNumber(STORAGE_KEYS.laneCount, 4, { min: 1, max: 8, integer: true }))
  const [minValidTimeSec, setMinValidTimeSec] = useState(() => readNumber(STORAGE_KEYS.minValidTimeSec, 0.5, { min: 0, max: 60 }))
  const [maxValidTimeSec, setMaxValidTimeSec] = useState(() => readNumber(STORAGE_KEYS.maxValidTimeSec, 10, { min: 0, max: 300 }))

  const [soundEnabled, setSoundEnabled] = useState(() => readBool(STORAGE_KEYS.soundEnabled, false))
  const [soundVolume, setSoundVolume] = useState(() => readNumber(STORAGE_KEYS.soundVolume, 1, { min: 0, max: 1 }))
  const [soundStartUrl, setSoundStartUrl] = useState(() => readString(STORAGE_KEYS.soundStartUrl, ''))
  const [soundFinishUrl, setSoundFinishUrl] = useState(() => readString(STORAGE_KEYS.soundFinishUrl, ''))

  const [mdnsResult, setMdnsResult] = useState<MdnsDiscoveryResponse | null>(null)

  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showSerialMonitor, setShowSerialMonitor] = useState(false)
  const [serialMonitorEnabled, setSerialMonitorEnabled] = useState(false)
  const [serialLog, setSerialLog] = useState<Array<{ direction: string; data: string; timestamp: string }>>([])
  const serialLogRef = useRef<HTMLPreElement>(null)

  const statusQ = useQuery({ queryKey: ['connection', 'status'], queryFn: getConnectionStatus, refetchInterval: 2000 })
  const portsQ = useQuery({ queryKey: ['connection', 'serial-ports'], queryFn: listSerialPorts })

  const mdnsM = useMutation({
    mutationFn: () => discoverMdns(1.5),
    onSuccess: (res) => {
      setMdnsResult(res)
      toast({ variant: 'success', title: 'mDNS discovery complete', description: `${res.services.length} service(s) found` })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to discover mDNS'
      toast({ variant: 'error', title: 'mDNS discovery failed', description: msg })
    },
  })

  const connectM = useMutation({
    mutationFn: async () => {
      if (connMode === 'serial') {
        const port = serialPort.trim()
        if (!port) throw new ApiError('Select a serial port first', 400, null)
        return connectTimer({ mode: 'serial', serial_port: port, baudrate, auto_reconnect: autoReconnect })
      }
      const host = tcpHost.trim()
      if (!host) throw new ApiError('Enter a host first', 400, null)
      return connectTimer({ mode: 'tcp', host, port: tcpPort, auto_reconnect: autoReconnect })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['connection', 'status'] })
      try {
        await setTimerLanes(laneCount)
      } catch {
        // ignore; timer may not be ready yet
      }
      toast({ variant: 'success', title: 'Connect requested' })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to connect'
      toast({ variant: 'error', title: 'Connect failed', description: msg })
    },
  })

  const disconnectM = useMutation({
    mutationFn: () => disconnectTimer(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['connection', 'status'] })
      toast({ variant: 'success', title: 'Disconnected' })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to disconnect'
      toast({ variant: 'error', title: 'Disconnect failed', description: msg })
    },
  })

  const setLanesM = useMutation({
    mutationFn: (n: number) => setTimerLanes(n),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['connection', 'status'] })
      toast({ variant: 'success', title: 'Lane count sent to timer' })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to set lanes'
      toast({ variant: 'error', title: 'Set lanes failed', description: msg })
    },
  })

  const resetAllM = useMutation({
    mutationFn: () => resetAllData(),
    onSuccess: () => {
      qc.invalidateQueries()
      toast({ variant: 'success', title: 'All data deleted' })
      setShowResetConfirm(false)
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to reset data'
      toast({ variant: 'error', title: 'Reset failed', description: msg })
    },
  })

  const serialMonitorM = useMutation({
    mutationFn: () => toggleSerialMonitor(),
    onSuccess: (res) => {
      setSerialMonitorEnabled(res.enabled)
    },
  })

  const handleWsMessage = useCallback((msg: unknown) => {
    const m = msg as { type?: string; payload?: { direction: string; data: string; timestamp: string } }
    if (m.type === 'serial_data' && m.payload) {
      setSerialLog((prev) => {
        const next = [...prev, m.payload!]
        return next.length > 500 ? next.slice(-500) : next
      })
    }
  }, [])

  useWebSocket({ onJsonMessage: handleWsMessage })

  const connected = statusQ.data?.connection_state === 'connected'

  const currentTarget = useMemo(() => {
    const s = statusQ.data
    if (!s) return '—'
    const parts = [s.mode ?? '—', s.target ?? '—']
    return parts.filter(Boolean).join(' • ')
  }, [statusQ.data])

  function storeConnMode(next: ConnMode) {
    setConnMode(next)
    writeValue(STORAGE_KEYS.connectionMode, next)
  }

  function storeSerialPort(next: string) {
    setSerialPort(next)
    writeValue(STORAGE_KEYS.serialPort, next)
  }

  function storeBaudrate(next: number) {
    const v = Math.trunc(clampNumber(next, 1200, 921600))
    setBaudrate(v)
    writeValue(STORAGE_KEYS.serialBaudrate, v)
  }

  function storeTcpHost(next: string) {
    setTcpHost(next)
    writeValue(STORAGE_KEYS.tcpHost, next)
  }

  function storeTcpPort(next: number) {
    const v = Math.trunc(clampNumber(next, 1, 65535))
    setTcpPort(v)
    writeValue(STORAGE_KEYS.tcpPort, v)
  }

  function storeAutoReconnect(next: boolean) {
    setAutoReconnect(next)
    writeValue(STORAGE_KEYS.autoReconnect, next)
  }

  function storeLaneCount(next: number) {
    const v = Math.trunc(clampNumber(next, 1, 8))
    setLaneCount(v)
    writeValue(STORAGE_KEYS.laneCount, v)
  }

  function storeMinValidTime(next: number) {
    const v = clampNumber(next, 0, 60)
    setMinValidTimeSec(v)
    writeValue(STORAGE_KEYS.minValidTimeSec, v)
  }

  function storeMaxValidTime(next: number) {
    const v = clampNumber(next, 0, 300)
    setMaxValidTimeSec(v)
    writeValue(STORAGE_KEYS.maxValidTimeSec, v)
  }

  function storeSoundEnabled(next: boolean) {
    setSoundEnabled(next)
    writeValue(STORAGE_KEYS.soundEnabled, next)
  }

  function storeSoundVolume(next: number) {
    const v = clampNumber(next, 0, 1)
    setSoundVolume(v)
    writeValue(STORAGE_KEYS.soundVolume, v)
  }

  function storeSoundStartUrl(next: string) {
    setSoundStartUrl(next)
    writeValue(STORAGE_KEYS.soundStartUrl, next.trim() || null)
  }

  function storeSoundFinishUrl(next: string) {
    setSoundFinishUrl(next)
    writeValue(STORAGE_KEYS.soundFinishUrl, next.trim() || null)
  }

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Configure how the app connects to the timer and how races are displayed.</p>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Connection</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              {statusPill(statusQ.data?.connection_state)}
              <span className="opacity-60">•</span>
              <span>{currentTarget}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => portsQ.refetch()}
              disabled={portsQ.isFetching}
              title="Refresh serial ports"
            >
              Refresh ports
            </Button>
            {connected ? (
              <Button variant="secondary" onClick={() => disconnectM.mutate()} disabled={disconnectM.isPending}>
                Disconnect
              </Button>
            ) : (
              <Button onClick={() => connectM.mutate()} disabled={connectM.isPending}>
                Connect
              </Button>
            )}
          </div>
        </div>

        {statusQ.data?.last_error ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            {statusQ.data.last_error}
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-sm font-semibold">Mode</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant={connMode === 'serial' ? 'primary' : 'secondary'} onClick={() => storeConnMode('serial')}>
                Serial
              </Button>
              <Button variant={connMode === 'tcp' ? 'primary' : 'secondary'} onClick={() => storeConnMode('tcp')}>
                Network
              </Button>
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={autoReconnect} onChange={(e) => storeAutoReconnect(e.target.checked)} />
              Auto reconnect
            </label>
          </div>

          {connMode === 'serial' ? (
            <div>
              <div className="text-sm font-semibold">Serial</div>
              <div className="mt-2 grid gap-2">
                <select
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950"
                  value={serialPort}
                  onChange={(e) => storeSerialPort(e.target.value)}
                >
                  <option value="">Select a port…</option>
                  {(portsQ.data ?? []).map((p) => (
                    <option key={p.device} value={p.device}>
                      {p.device}{p.description ? ` — ${p.description}` : ''}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-2">
                  <label className="text-sm text-slate-700 dark:text-slate-200">
                    Baudrate
                    <input
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950"
                      value={baudrate}
                      onChange={(e) => storeBaudrate(Number(e.target.value))}
                      inputMode="numeric"
                    />
                  </label>

                  <div className="text-sm text-slate-700 dark:text-slate-200">
                    Ports
                    <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {portsQ.isFetching ? 'Loading…' : `${(portsQ.data ?? []).length} found`}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="text-sm font-semibold">Network</div>
              <div className="mt-2 grid gap-2">
                <div className="grid grid-cols-3 gap-2">
                  <label className="col-span-2 text-sm text-slate-700 dark:text-slate-200">
                    Host
                    <input
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950"
                      value={tcpHost}
                      onChange={(e) => storeTcpHost(e.target.value)}
                      placeholder="pwdtimer.local"
                    />
                  </label>
                  <label className="text-sm text-slate-700 dark:text-slate-200">
                    Port
                    <input
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950"
                      value={tcpPort}
                      onChange={(e) => storeTcpPort(Number(e.target.value))}
                      inputMode="numeric"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" onClick={() => mdnsM.mutate()} disabled={mdnsM.isPending}>
                    Discover mDNS
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      storeTcpHost('pwdtimer.local')
                      storeTcpPort(8080)
                    }}
                  >
                    Use pwdtimer.local
                  </Button>
                </div>

                {mdnsResult ? (
                  <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Discovered</div>
                    <div className="mt-2 space-y-2">
                      {mdnsResult.services.length ? (
                        <div>
                          <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Services</div>
                          <div className="mt-1 flex flex-col gap-1">
                            {mdnsResult.services.map((s) => (
                              <button
                                key={`${s.host}:${s.port}:${s.name}`}
                                type="button"
                                className="text-left text-sm underline decoration-slate-300 hover:decoration-slate-500 dark:decoration-slate-700"
                                onClick={() => {
                                  storeTcpHost(s.host)
                                  storeTcpPort(s.port)
                                }}
                              >
                                {s.name} — {s.host}:{s.port}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div>
                        <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">pwdtimer.local</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {mdnsResult.pwdtimer_local_addresses.length ? mdnsResult.pwdtimer_local_addresses.join(', ') : 'No addresses resolved'}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="text-sm font-semibold">Race parameters</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-700 dark:text-slate-200">
              Minimum valid time (sec)
              <input
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950"
                value={minValidTimeSec}
                onChange={(e) => storeMinValidTime(Number(e.target.value))}
                inputMode="decimal"
              />
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-200">
              Maximum valid time (sec)
              <input
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950"
                value={maxValidTimeSec}
                onChange={(e) => storeMaxValidTime(Number(e.target.value))}
                inputMode="decimal"
              />
            </label>
          </div>

          <div className="mt-4 text-sm font-semibold">Lane count</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {[4, 6, 8].map((n) => (
              <Button key={n} variant={laneCount === n ? 'primary' : 'secondary'} onClick={() => storeLaneCount(n)}>
                {n}
              </Button>
            ))}
            <Button
              variant="secondary"
              onClick={() => setLanesM.mutate(laneCount)}
              disabled={!connected || setLanesM.isPending}
              title={connected ? 'Send SET_LANES to the timer' : 'Connect to the timer first'}
            >
              Apply to timer
            </Button>
          </div>

          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            These values are stored locally. The backend uses timer-reported times; validation will be applied in the UI.
          </div>
        </Card>

        <Card>
          <div className="text-sm font-semibold">Appearance & sound</div>

          <div className="mt-3">
            <div className="text-sm font-semibold">Theme</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant={themeMode === 'light' ? 'primary' : 'secondary'} onClick={() => setThemeMode('light')}>
                Light
              </Button>
              <Button variant={themeMode === 'dark' ? 'primary' : 'secondary'} onClick={() => setThemeMode('dark')}>
                Dark
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-sm font-semibold">Sounds</div>
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={soundEnabled} onChange={(e) => storeSoundEnabled(e.target.checked)} />
              Enable start/finish sounds
            </label>

            <div className="mt-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-700 dark:text-slate-200">Volume</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{Math.round(soundVolume * 100)}%</div>
              </div>
              <input
                className="mt-1 w-full"
                type="range"
                min={0}
                max={100}
                value={Math.round(soundVolume * 100)}
                onChange={(e) => storeSoundVolume(Number(e.target.value) / 100)}
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-slate-700 dark:text-slate-200">
                Start sound URL (optional)
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950"
                  value={soundStartUrl}
                  onChange={(e) => storeSoundStartUrl(e.target.value)}
                  placeholder="https://…/start.mp3"
                />
              </label>
              <label className="text-sm text-slate-700 dark:text-slate-200">
                Finish sound URL (optional)
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950"
                  value={soundFinishUrl}
                  onChange={(e) => storeSoundFinishUrl(e.target.value)}
                  placeholder="https://…/finish.mp3"
                />
              </label>
            </div>
          </div>
        </Card>
      </div>

      {/* System / Debug */}
      <Card>
        <div className="text-sm font-semibold">System</div>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => {
            if (!serialMonitorEnabled) serialMonitorM.mutate()
            setShowSerialMonitor(true)
          }}>
            Serial Monitor
          </Button>
          <Button
            className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
            onClick={() => setShowResetConfirm(true)}
          >
            Reset All Data
          </Button>
        </div>
      </Card>

      {/* Reset confirmation dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowResetConfirm(false)}>
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">Reset All Data</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              This will permanently delete <strong>all groups, racers, races, heats, and results</strong>. This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowResetConfirm(false)}>Cancel</Button>
              <Button
                className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
                onClick={() => resetAllM.mutate()}
                disabled={resetAllM.isPending}
              >
                {resetAllM.isPending ? 'Deleting…' : 'Yes, Delete Everything'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Serial Monitor dialog */}
      {showSerialMonitor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => {
          setShowSerialMonitor(false)
          if (serialMonitorEnabled) serialMonitorM.mutate()
        }}>
          <div className="mx-4 flex h-[70vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <h2 className="text-lg font-semibold">Serial Monitor</h2>
              <div className="flex items-center gap-2">
                <span className={cn(
                  'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                  serialMonitorEnabled ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                )}>
                  {serialMonitorEnabled ? 'Active' : 'Paused'}
                </span>
                <Button variant="secondary" size="sm" onClick={() => serialMonitorM.mutate()}>
                  {serialMonitorEnabled ? 'Pause' : 'Resume'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setSerialLog([])}>Clear</Button>
                <Button variant="secondary" size="sm" onClick={() => {
                  setShowSerialMonitor(false)
                  if (serialMonitorEnabled) serialMonitorM.mutate()
                }}>
                  Close
                </Button>
              </div>
            </div>
            <pre
              ref={serialLogRef}
              className="flex-1 overflow-auto bg-slate-950 p-4 font-mono text-xs text-green-400"
              style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
            >
              {serialLog.length === 0 ? (
                <span className="text-slate-500">Waiting for serial data…</span>
              ) : (
                serialLog.map((entry, i) => (
                  <div key={i}>
                    <span className="text-slate-500">{new Date(entry.timestamp).toLocaleTimeString()}</span>{' '}
                    <span className={entry.direction === 'tx' ? 'text-cyan-400' : 'text-green-400'}>
                      [{entry.direction.toUpperCase()}]
                    </span>{' '}
                    {entry.data}
                  </div>
                ))
              )}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
