import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { useToast } from '../components/ui/Toast'

import { ApiError } from '../api/client'
import { resetTimer, setTimerLanes } from '../api/endpoints/connection'
import type { Heat, HeatUpdateRequest, Race } from '../api/endpoints/races'
import { listHeats, listRaces, updateHeat } from '../api/endpoints/races'
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

function LaneCard({
  laneNumber,
  racer,
  timeUs,
  place,
  dnf,
  onDnf,
  disabled,
}: {
  laneNumber: number
  racer?: Racer
  timeUs: number | null
  place: number | null
  dnf?: boolean
  onDnf?: () => void
  disabled?: boolean
}) {
  return (
    <Card className={cn(
      'relative p-5',
      disabled ? 'border-slate-200 bg-slate-100 opacity-50 dark:border-slate-800 dark:bg-slate-900' : null,
      dnf && !disabled ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20' : null,
    )}>
      {/* No-show badge */}
      {disabled && racer ? (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-slate-500/80 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
          No-show
        </div>
      ) : null}

      {/* Muted DNF toggle — top-right corner */}
      {onDnf && racer && !disabled ? (
        <button
          type="button"
          onClick={onDnf}
          className={cn(
            'absolute right-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors',
            dnf
              ? 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-800/60'
              : 'text-rose-900/30 hover:bg-rose-50 hover:text-rose-800/70 dark:text-rose-400/25 dark:hover:bg-rose-950/40 dark:hover:text-rose-400/60',
          )}
        >
          {dnf ? 'Undo DNF' : 'DNF'}
        </button>
      ) : null}

      <div className={cn('min-w-0', onDnf && racer ? 'pr-14' : null)}>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Lane {laneNumber}</div>
        <div className="mt-1 truncate text-lg font-semibold leading-tight">{laneLabel(racer)}</div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className={cn('text-4xl font-bold tabular-nums', dnf ? 'text-red-400/70 line-through' : null)}>
          {dnf ? 'DNF' : formatTimeUs(timeUs)}
        </div>
        {!dnf && place != null ? (
          <div className="rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white dark:bg-slate-50 dark:text-slate-900">
            {placeLabel(place)}
          </div>
        ) : null}
      </div>
    </Card>
  )
}

export function RacePage() {
  const { toast } = useToast()
  const qc = useQueryClient()

  const [timerConn, setTimerConn] = useState<TimerConnectionStatus | null>(null)
  const [raceState, setRaceState] = useState<TimerRaceState | null>(null)
  const [laneTimes, setLaneTimes] = useState<TimerLaneTimes | null>(null)

  const [selectedRaceId, setSelectedRaceId] = useState<number | null>(null)
  const [manualHeatId, setManualHeatId] = useState<number | null>(null)
  const [navTarget, setNavTarget] = useState<Heat | null>(null)
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
    if (manualHeatId != null) return heats.find((h) => h.id === manualHeatId) ?? null
    return heats.find((h) => h.status === 'in_progress') ?? heats.find((h) => h.status === 'pending') ?? heats[heats.length - 1]
  }, [heatsQ.data, manualHeatId])

  const prevHeat = useMemo<Heat | null>(() => {
    const heats = heatsQ.data ?? []
    if (!currentHeat) return null
    const idx = heats.findIndex((h) => h.id === currentHeat.id)
    if (idx <= 0) return null
    return heats[idx - 1]
  }, [heatsQ.data, currentHeat])

  const nextHeat = useMemo<Heat | null>(() => {
    const heats = heatsQ.data ?? []
    if (!currentHeat) return null
    const idx = heats.findIndex((h) => h.id === currentHeat.id)
    if (idx < 0 || idx >= heats.length - 1) return null
    return heats[idx + 1]
  }, [heatsQ.data, currentHeat])

  const firstUncompletedHeat = useMemo<Heat | null>(() => {
    return (heatsQ.data ?? []).find((h) => h.status !== 'completed') ?? null
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

  async function doReset() {
    try {
      await resetTimer()
      toast({ variant: 'success', title: 'Timer reset' })
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to reset timer'
      toast({ variant: 'error', title: 'Reset failed', description: msg })
    }
  }

  const acceptAndAdvanceM = useMutation({
    mutationFn: async () => {
      if (!currentHeat) throw new Error('No current heat')
      // If the heat still has lane time data from the timer, save it first
      if (laneTimes && currentHeat.status !== 'completed') {
        const laneUpdates = Array.from({ length: numLanes }, (_, i) => ({
          lane_number: i + 1,
          time_microseconds: laneTimes.lane_end_times_us?.[i] ?? null,
        })).filter((l) => l.time_microseconds != null && l.time_microseconds > 0) as Array<{ lane_number: number; time_microseconds: number | null }>
        await updateHeat(currentHeat.id, { status: 'completed', lanes: laneUpdates.length ? laneUpdates : undefined })
      } else if (currentHeat.status !== 'completed') {
        await updateHeat(currentHeat.id, { status: 'completed' })
      }
      // Reset timer for next heat
      try { await resetTimer() } catch { /* ignore if timer not connected */ }
    },
    onSuccess: async () => {
      setManualHeatId(null)
      setRaceState(null)
      setLaneTimes(null)
      await qc.invalidateQueries({ queryKey: ['heats'] })
      toast({ variant: 'success', title: 'Heat accepted — advancing to next heat' })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to accept heat'
      toast({ variant: 'error', title: 'Accept failed', description: msg })
    },
  })

  function hasUnsavedResults(): boolean {
    // Live timer times recorded but not yet accepted. Treat 0us as "didn't
    // finish" because the firmware always emits 8 lane fields zero-padded for
    // inactive lanes — `0` does NOT mean "lane finished at t=0".
    const times = laneTimes?.lane_end_times_us ?? []
    if (times.some((t) => t != null && t > 0) && currentHeat?.status !== 'completed') return true
    // DNF flags set on an incomplete heat (need Accept to persist results)
    if (currentHeat && currentHeat.status !== 'completed' && currentHeat.lanes.some((l) => l.dnf)) return true
    return false
  }

  function doNavigate(target: Heat) {
    setManualHeatId(target.id)
    setLaneTimes(null)
    setRaceState(null)
    setNavTarget(null)
  }

  function navigateTo(target: Heat) {
    if (hasUnsavedResults()) {
      setNavTarget(target)
    } else {
      doNavigate(target)
    }
  }

  const toggleDnfM = useMutation({
    mutationFn: async ({ laneNumber, dnf }: { laneNumber: number; dnf: boolean }) => {
      if (!currentHeat) throw new Error('No current heat')
      // If the heat was already accepted, bumping DNF flags must re-open it so
      // Accept can re-run results and firstUncompletedHeat can find it.
      const payload: HeatUpdateRequest = { lanes: [{ lane_number: laneNumber, dnf }] }
      if (currentHeat.status === 'completed') payload.status = 'pending'
      await updateHeat(currentHeat.id, payload)
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['heats'] })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to update DNF'
      toast({ variant: 'error', title: 'DNF failed', description: msg })
    },
  })

  const resetHeatM = useMutation({
    mutationFn: async () => {
      if (!currentHeat) throw new Error('No current heat')
      const laneResets = currentHeat.lanes.map((l) => ({
        lane_number: l.lane_number,
        time_microseconds: null as number | null,
        dnf: false,
      }))
      await updateHeat(currentHeat.id, { status: 'pending', lanes: laneResets })
      try { await resetTimer() } catch { /* ignore */ }
    },
    onSuccess: async () => {
      setLaneTimes(null)
      setRaceState(null)
      await qc.invalidateQueries({ queryKey: ['heats'] })
      toast({ variant: 'success', title: `Heat #${currentHeat?.heat_number} reset to pending` })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to reset heat'
      toast({ variant: 'error', title: 'Reset failed', description: msg })
    },
  })

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
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="text-xl font-semibold">Race</h1>
          <select
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950"
            value={activeRaceId ?? ''}
            onChange={(e) => setSelectedRaceId(e.target.value ? Number(e.target.value) : null)}
          >
            {(racesQ.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <span className="text-sm text-slate-600 dark:text-slate-300">{heatLabel}</span>
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

          {timerConn?.connection_state !== 'connected' && raceState && raceState.state_name !== 'RESET' ? (
            <div className="mt-4 rounded-md border border-red-300 bg-red-100 p-3 text-sm font-semibold text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100">
              ⚠ Timer connection lost mid-race — recorded times may be incomplete. Reconnect before accepting results.
            </div>
          ) : null}
        </Card>

        <Card>
          <div className="text-sm font-semibold">Controls</div>
          <div className="mt-3">
            {/* ARM is a no-op in this firmware — the timer arms itself automatically
                when the start gate is physically in the set position. Reset is the
                only control needed to clear times and restart the state machine. */}
            <Button
              className="w-full"
              variant="secondary"
              onClick={doReset}
              disabled={timerConn?.connection_state !== 'connected'}
            >
              Reset Timer
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

          <div className="mt-4 space-y-2">
            <Button
              className="w-full"
              variant="primary"
              onClick={() => {
                // Guard: confirm if accepting a heat that has neither any
                // real lane finishes nor any DNFs marked. Prevents silently
                // completing heats when the timer was offline.
                const times = laneTimes?.lane_end_times_us ?? []
                const anyFinish = times.some((t) => t != null && t > 0)
                const anyDnf = !!currentHeat?.lanes.some((l) => l.dnf)
                const completing = currentHeat && currentHeat.status !== 'completed'
                if (completing && !anyFinish && !anyDnf) {
                  const ok = window.confirm(
                    'No lane times or DNFs are recorded for this heat. Accept anyway and mark it completed with no results?',
                  )
                  if (!ok) return
                }
                acceptAndAdvanceM.mutate()
              }}
              disabled={!currentHeat || acceptAndAdvanceM.isPending}
            >
              {acceptAndAdvanceM.isPending ? 'Saving…' : 'Accept Results & Next Heat'}
            </Button>
            <div className="grid grid-cols-3 gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => prevHeat && navigateTo(prevHeat)}
                disabled={!prevHeat}
                title="Previous heat"
              >
                ← Prev
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => firstUncompletedHeat && navigateTo(firstUncompletedHeat)}
                disabled={!firstUncompletedHeat}
                title="First uncompleted heat"
              >
                First ↑
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => nextHeat && navigateTo(nextHeat)}
                disabled={!nextHeat}
                title="Next heat"
              >
                Next →
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Current Heat — Lane Cards */}
      {currentHeat ? (
        <div className="rounded-xl border-2 border-blue-500 bg-blue-50/50 p-4 dark:border-blue-400 dark:bg-blue-950/20">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                Current Heat
              </span>
              <span className="text-sm font-semibold">Heat #{currentHeat.heat_number}</span>
            </div>
            <button
              type="button"
              onClick={() => resetHeatM.mutate()}
              disabled={resetHeatM.isPending}
              title="Reset heat back to pending (clears times, places, and DNF flags)"
              className="rounded px-2 py-0.5 text-xs text-slate-400/50 transition-colors hover:bg-slate-200/70 hover:text-slate-600 disabled:opacity-40 dark:text-slate-500/50 dark:hover:bg-slate-700/60 dark:hover:text-slate-400"
            >
              Reset heat
            </button>
          </div>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: numLanes }, (_, i) => i + 1).map((laneNumber) => {
              const heatLane = currentHeat.lanes.find((l) => l.lane_number === laneNumber)
              const racer = heatLane?.racer_id != null ? racersById.get(heatLane.racer_id) : undefined

              const rawTimeUs = laneTimes?.lane_end_times_us?.[laneNumber - 1] ?? null
              // Firmware sends 0 for lanes that haven't finished yet; render as null.
              const timeUs = rawTimeUs != null && rawTimeUs > 0 ? rawTimeUs : null
              const place = laneTimes?.lane_places ? laneTimes.lane_places[String(laneNumber)] ?? null : null
              const isDnf = heatLane?.dnf ?? false
              const isDisabled = racer?.disabled ?? false

              return (
                <LaneCard
                  key={laneNumber}
                  laneNumber={laneNumber}
                  racer={racer}
                  timeUs={isDisabled ? null : timeUs}
                  place={isDnf || isDisabled ? null : place}
                  dnf={isDnf}
                  disabled={isDisabled}
                  onDnf={() => toggleDnfM.mutate({ laneNumber, dnf: !isDnf })}
                />
              )
            })}
          </div>
        </div>
      ) : null}

      {/* On Deck — Next Heat */}
      {nextHeat ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50/50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950/20">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              On Deck
            </span>
            <span className="text-xs font-semibold">Heat #{nextHeat.heat_number}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[...nextHeat.lanes]
              .sort((a, b) => a.lane_number - b.lane_number)
              .map((ln) => {
                const racer = ln.racer_id != null ? racersById.get(ln.racer_id) : undefined
                return (
                  <div
                    key={ln.id}
                    className="rounded-md border border-amber-200 bg-white px-3 py-2 dark:border-amber-800 dark:bg-slate-900"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Lane {ln.lane_number}
                    </div>
                    <div className="text-xs font-medium">{laneLabel(racer)}</div>
                  </div>
                )
              })}
          </div>
        </div>
      ) : null}

      {racesQ.isError || heatsQ.isError || racersQ.isError ? (
        <Card className="border-red-200 bg-red-50 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          Failed to load race data.
        </Card>
      ) : null}

      {/* Navigate-away warning dialog */}
      {navTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="text-base font-semibold">Unsaved Results</div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              The current heat has recorded times that haven't been accepted yet. If you navigate away, those times will be discarded.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setNavTarget(null)}>Stay</Button>
              <Button variant="danger" onClick={() => doNavigate(navTarget)}>Discard & Navigate</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
