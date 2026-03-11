import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { useToast } from '../components/ui/Toast'

import { ApiError } from '../api/client'
import { armTimer, resetTimer, setTimerLanes } from '../api/endpoints/connection'
import type { Heat, Race } from '../api/endpoints/races'
import { listHeats, listRaces } from '../api/endpoints/races'
import type { Racer } from '../api/endpoints/racers'
import { listRacers } from '../api/endpoints/racers'
import { cn } from '../lib/cn'
import { STORAGE_KEYS, clampNumber, readBool, readNumber, readString, writeValue } from '../lib/settings'
import { useWebSocket } from '../hooks/useWebSocket'

type TimerConnectionStatus = {
  connection_state: 'disconnected' | 'connecting' | 'connected'
  mode: 'serial' | 'tcp' | null
  target: string | null
  last_message_at: string | null
  last_error: string | null
}

type TimerRaceState = {
  state: number
  state_name: string
  start_time_us: number | null
  current_time_us: number | null
  num_lanes: number | null
}

type TimerLaneTimes = {
  num_lanes: number | null
  lane_end_times_us: Array<number | null>
  lane_places: Record<string, number>
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, Math.trunc(v)))
}

function formatTimeUs(timeUs: number | null): string {
  if (timeUs == null) return '—'
  const s = timeUs / 1_000_000
  return `${s.toFixed(4)}s`
}

function formatElapsedUs(timeUs: number | null): string {
  if (timeUs == null) return '—'
  const s = timeUs / 1_000_000
  return s >= 10 ? `${s.toFixed(2)}s` : `${s.toFixed(3)}s`
}

function placeLabel(p: number | null): string {
  if (p == null) return ''
  if (p === 1) return '1st'
  if (p === 2) return '2nd'
  if (p === 3) return '3rd'
  return `${p}th`
}

function mapStateLabel(stateName: string | null | undefined): { label: string; className: string } {
  const name = (stateName || '').toUpperCase()
  if (name === 'SET') return { label: 'Set', className: 'bg-amber-400 text-slate-950' }
  if (name === 'IN_RACE') return { label: 'Racing', className: 'bg-emerald-500 text-white' }
  if (name === 'FINISHED') return { label: 'Finished', className: 'bg-sky-500 text-white' }
  return { label: 'Ready', className: 'bg-slate-300 text-slate-950 dark:bg-slate-700 dark:text-slate-50' }
}

function elapsedUsFromRaceState(rs: TimerRaceState | null): number | null {
  if (!rs) return null
  const cur = rs.current_time_us
  const start = rs.start_time_us
  if (cur == null) return null
  if (start == null) return cur
  return cur >= start ? cur - start : cur
}

function playSound(kind: 'start' | 'finish') {
  const volume = clampNumber(readNumber(STORAGE_KEYS.soundVolume, 1, { min: 0, max: 1 }), 0, 1)
  if (volume <= 0) return

  const urlKey = kind === 'start' ? STORAGE_KEYS.soundStartUrl : STORAGE_KEYS.soundFinishUrl
  const url = readString(urlKey, '').trim()
  if (url) {
    try {
      const a = new Audio(url)
      a.volume = volume
      void a.play().catch(() => {})
      return
    } catch {
      // fall back to oscillator
    }
  }

  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return

  const ctx = new Ctx()
  const o = ctx.createOscillator()
  const g = ctx.createGain()

  o.type = 'sine'
  o.frequency.value = kind === 'start' ? 880 : 523.25

  g.gain.value = 0.0001
  o.connect(g)
  g.connect(ctx.destination)

  const t0 = ctx.currentTime
  g.gain.exponentialRampToValueAtTime(0.15 * volume, t0 + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + (kind === 'start' ? 0.18 : 0.35))

  o.start()
  o.stop(t0 + (kind === 'start' ? 0.2 : 0.4))

  o.onended = () => {
    ctx.close().catch(() => {})
  }
}

function laneLabel(racer: Racer | undefined): string {
  if (!racer) return '—'
  const car = racer.car_name
    ? racer.car_number
      ? `${racer.car_name} (#${racer.car_number})`
      : racer.car_name
    : racer.car_number
      ? `#${racer.car_number}`
      : ''
  return car ? `${racer.name} — ${car}` : racer.name
}

function LaneCard({ laneNumber, racer, timeUs, place }: { laneNumber: number; racer?: Racer; timeUs: number | null; place: number | null }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Lane {laneNumber}</div>
          <div className="mt-1 text-lg font-semibold leading-tight">{laneLabel(racer)}</div>
        </div>
        {place != null ? (
          <div className="rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white dark:bg-slate-50 dark:text-slate-900">
            {placeLabel(place)}
          </div>
        ) : null}
      </div>

      <div className="mt-4 text-4xl font-bold tabular-nums">{formatTimeUs(timeUs)}</div>
    </Card>
  )
}

export function RacePage() {
  const { toast } = useToast()

  const [timerConn, setTimerConn] = useState<TimerConnectionStatus | null>(null)
  const [raceState, setRaceState] = useState<TimerRaceState | null>(null)
  const [laneTimes, setLaneTimes] = useState<TimerLaneTimes | null>(null)

  const [selectedRaceId, setSelectedRaceId] = useState<number | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(() => readBool(STORAGE_KEYS.soundEnabled, false))
  const soundEnabledRef = useRef(soundEnabled)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const racesQ = useQuery({ queryKey: ['races'], queryFn: listRaces })
  const racersQ = useQuery({ queryKey: ['racers', 'all'], queryFn: () => listRacers() })

  const activeRaceId = useMemo(() => {
    const races = racesQ.data ?? []
    if (races.length === 0) return null
    if (selectedRaceId != null && races.some((r) => r.id === selectedRaceId)) return selectedRaceId
    return races[0].id
  }, [racesQ.data, selectedRaceId])

  const selectedRace = useMemo<Race | null>(() => {
    if (activeRaceId == null) return null
    return (racesQ.data ?? []).find((r) => r.id === activeRaceId) ?? null
  }, [activeRaceId, racesQ.data])

  const heatsQ = useQuery({
    queryKey: ['heats', activeRaceId],
    queryFn: () => listHeats(activeRaceId as number),
    enabled: activeRaceId != null,
  })

  const racersById = useMemo(() => {
    const m = new Map<number, Racer>()
    for (const r of racersQ.data ?? []) m.set(r.id, r)
    return m
  }, [racersQ.data])

  const currentHeat = useMemo<Heat | null>(() => {
    const heats = heatsQ.data ?? []
    if (heats.length === 0) return null
    return heats.find((h) => h.status === 'in_progress') ?? heats.find((h) => h.status === 'pending') ?? heats[heats.length - 1]
  }, [heatsQ.data])

  const numLanes = useMemo(() => {
    const fromTimer = laneTimes?.num_lanes ?? raceState?.num_lanes
    const fromRace = selectedRace?.num_lanes
    return clampInt(fromTimer ?? fromRace ?? 4, 1, 8)
  }, [laneTimes?.num_lanes, raceState?.num_lanes, selectedRace?.num_lanes])

  useEffect(() => {
    soundEnabledRef.current = soundEnabled
    writeValue(STORAGE_KEYS.soundEnabled, soundEnabled)
  }, [soundEnabled])

  const onJsonMessage = useCallback((data: unknown) => {
    if (!data || typeof data !== 'object') return
    const msg = data as { type?: unknown; payload?: unknown }
    if (typeof msg.type !== 'string') return

    if (msg.type === 'connection_status') {
      setTimerConn(msg.payload as TimerConnectionStatus)
    } else if (msg.type === 'race_state') {
      setRaceState(msg.payload as TimerRaceState)
    } else if (msg.type === 'lane_times') {
      setLaneTimes(msg.payload as TimerLaneTimes)
    } else if (msg.type === 'heat_complete') {
      if (soundEnabledRef.current) playSound('finish')
    }
  }, [])

  const { status: wsStatus, connect: wsConnect, disconnect: wsDisconnect } = useWebSocket({
    onJsonMessage,
  })

  const prevStateRef = useRef<string | null>(null)
  useEffect(() => {
    const cur = raceState?.state_name ?? null
    const prev = prevStateRef.current
    if (soundEnabled && cur && cur !== prev) {
      if (cur.toUpperCase() === 'IN_RACE') playSound('start')
    }
    prevStateRef.current = cur
  }, [raceState?.state_name, soundEnabled])

  useEffect(() => {
    const onFs = () => setIsFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener('fullscreenchange', onFs)
    onFs()
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  async function toggleFullscreen() {
    try {
      const el = containerRef.current
      if (!el) return
      if (document.fullscreenElement === el) {
        await document.exitFullscreen()
      } else {
        await el.requestFullscreen()
      }
    } catch (e) {
      toast({ variant: 'error', title: 'Fullscreen failed', description: String(e) })
    }
  }

  async function doArm() {
    try {
      await armTimer()
      toast({ variant: 'success', title: 'Timer armed' })
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to arm timer'
      toast({ variant: 'error', title: 'Arm failed', description: msg })
    }
  }

  async function doReset() {
    try {
      await resetTimer()
      toast({ variant: 'success', title: 'Timer reset' })
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to reset timer'
      toast({ variant: 'error', title: 'Reset failed', description: msg })
    }
  }

  async function doSetLanes(n: number) {
    try {
      await setTimerLanes(n)
      toast({ variant: 'success', title: `Set lanes: ${n}` })
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to set lanes'
      toast({ variant: 'error', title: 'Set lanes failed', description: msg })
    }
  }

  const stateMeta = mapStateLabel(raceState?.state_name)
  const elapsedUs = elapsedUsFromRaceState(raceState)

  const timerStateText = timerConn
    ? `${timerConn.connection_state}${timerConn.mode ? ` • ${timerConn.mode}` : ''}${timerConn.target ? ` • ${timerConn.target}` : ''}`
    : '—'

  const wsPill =
    wsStatus === 'connected'
      ? 'bg-emerald-500 text-white'
      : wsStatus === 'connecting'
        ? 'bg-amber-400 text-slate-950'
        : 'bg-slate-300 text-slate-950 dark:bg-slate-700 dark:text-slate-50'

  const timerPill =
    timerConn?.connection_state === 'connected'
      ? 'bg-emerald-500 text-white'
      : timerConn?.connection_state === 'connecting'
        ? 'bg-amber-400 text-slate-950'
        : 'bg-slate-300 text-slate-950 dark:bg-slate-700 dark:text-slate-50'

  const heatLabel = currentHeat ? `Heat ${currentHeat.heat_number}` : 'No heats'

  return (
    <div ref={containerRef} className={cn('space-y-4', isFullscreen ? 'min-h-screen bg-slate-50 p-6 dark:bg-slate-950' : null)}>
      <Card className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Race</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <span className="truncate">{selectedRace ? selectedRace.name : 'No race selected'}</span>
            <span className="opacity-60">•</span>
            <span>{heatLabel}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className={cn('rounded-full px-3 py-1 text-xs font-semibold', wsPill)}>WS: {wsStatus}</div>
          <div className={cn('rounded-full px-3 py-1 text-xs font-semibold', timerPill)}>Timer: {timerConn?.connection_state ?? '—'}</div>
          <Button variant="secondary" onClick={() => {
            wsDisconnect()
            wsConnect()
          }}>
            Reconnect
          </Button>
          <Button variant="secondary" onClick={toggleFullscreen}>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</Button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className={cn('rounded-full px-3 py-1 text-sm font-semibold', stateMeta.className)}>{stateMeta.label}</div>
              <div className="text-sm text-slate-600 dark:text-slate-300">{timerStateText}</div>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} />
                Sounds
              </label>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center">
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Elapsed</div>
              <div className="mt-1 text-6xl font-bold tabular-nums md:text-7xl">{formatElapsedUs(elapsedUs)}</div>
            </div>
          </div>

          {timerConn?.last_error ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
              {timerConn.last_error}
            </div>
          ) : null}
        </Card>

        <Card>
          <div className="text-sm font-semibold">Controls</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button onClick={doArm} disabled={timerConn?.connection_state !== 'connected'}>
              Arm
            </Button>
            <Button variant="secondary" onClick={doReset} disabled={timerConn?.connection_state !== 'connected'}>
              Reset
            </Button>
          </div>

          <div className="mt-4 text-sm font-semibold">Lanes</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {[4, 6, 8].map((n) => (
              <Button
                key={n}
                variant={n === numLanes ? 'primary' : 'secondary'}
                onClick={() => doSetLanes(n)}
                disabled={timerConn?.connection_state !== 'connected'}
              >
                {n}
              </Button>
            ))}
          </div>

          <div className="mt-4">
            <div className="text-sm font-semibold">Race selection</div>
            <select
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950"
              value={activeRaceId ?? ''}
              onChange={(e) => setSelectedRaceId(e.target.value ? Number(e.target.value) : null)}
            >
              {(racesQ.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: numLanes }, (_, i) => i + 1).map((laneNumber) => {
          const heatLane = currentHeat?.lanes.find((l) => l.lane_number === laneNumber)
          const racer = heatLane?.racer_id != null ? racersById.get(heatLane.racer_id) : undefined

          const timeUs = laneTimes?.lane_end_times_us?.[laneNumber - 1] ?? null
          const place = laneTimes?.lane_places ? laneTimes.lane_places[String(laneNumber)] ?? null : null

          return <LaneCard key={laneNumber} laneNumber={laneNumber} racer={racer} timeUs={timeUs} place={place} />
        })}
      </div>

      {racesQ.isError || heatsQ.isError || racersQ.isError ? (
        <Card className="border-red-200 bg-red-50 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          Failed to load race data.
        </Card>
      ) : null}
    </div>
  )
}
