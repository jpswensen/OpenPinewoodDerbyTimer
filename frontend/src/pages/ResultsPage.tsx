import { Fragment, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Table } from '../components/ui/Table'
import { useToast } from '../components/ui/Toast'

import { ApiError } from '../api/client'
import { listGroups } from '../api/endpoints/groups'
import { listRacers } from '../api/endpoints/racers'
import { listHeats, listRaces } from '../api/endpoints/races'
import type { Group } from '../api/endpoints/groups'
import type { Racer } from '../api/endpoints/racers'
import type { Race } from '../api/endpoints/races'
import { cn } from '../lib/cn'

type SortKey =
  | 'place'
  | 'name'
  | 'group'
  | 'avg'
  | 'best'
  | `lane:${number}`

type SortDir = 'asc' | 'desc'

type Run = {
  heat_number: number
  lane_number: number
  time_microseconds: number | null
  place: number | null
  dnf: boolean
}

type ResultRow = {
  racer: Racer
  group: Group | null
  lane_times_us: Array<number | null>
  average_us: number | null
  best_us: number | null
  place: number | null
  runs: Run[]
  dnf_count: number
}

function formatTimeUs(timeUs: number | null): string {
  if (timeUs == null) return '—'
  const s = timeUs / 1_000_000
  return `${s.toFixed(4)}s`
}

function carLabel(r: Racer): string {
  if (r.car_name && r.car_number) return `${r.car_name} (#${r.car_number})`
  if (r.car_name) return r.car_name
  if (r.car_number) return `#${r.car_number}`
  return ''
}

function buildApiUrl(path: string, query?: Record<string, string | number | boolean | null | undefined>): string {
  const base = import.meta.env.VITE_API_BASE_URL || '/api'
  const url = new URL(`${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`, window.location.origin)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue
      url.searchParams.set(k, String(v))
    }
  }
  return url.toString()
}

function parseFilenameFromContentDisposition(headerValue: string | null): string | null {
  if (!headerValue) return null
  // attachment; filename="race-1-results.pdf"
  const m = /filename\*=UTF-8''([^;]+)|filename="?([^;"]+)"?/i.exec(headerValue)
  const raw = (m?.[1] ?? m?.[2])?.trim()
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function toggleSort(prev: { key: SortKey; dir: SortDir }, nextKey: SortKey): { key: SortKey; dir: SortDir } {
  if (prev.key !== nextKey) return { key: nextKey, dir: 'asc' }
  return { key: nextKey, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
}

function cmp(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

export function ResultsPage() {
  const { toast } = useToast()

  const [selectedRaceId, setSelectedRaceId] = useState<number | null>(null)
  const [filterGroupId, setFilterGroupId] = useState<number | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'place', dir: 'asc' })
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())

  const racesQ = useQuery({ queryKey: ['races'], queryFn: listRaces })
  const groupsQ = useQuery({ queryKey: ['groups'], queryFn: listGroups })
  const racersQ = useQuery({ queryKey: ['racers', 'all'], queryFn: () => listRacers() })

  const activeRaceId = useMemo(() => {
    const races = racesQ.data ?? []
    if (!races.length) return null
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

  const groupsById = useMemo(() => {
    const m = new Map<number, Group>()
    for (const g of groupsQ.data ?? []) m.set(g.id, g)
    return m
  }, [groupsQ.data])

  const racersById = useMemo(() => {
    const m = new Map<number, Racer>()
    for (const r of racersQ.data ?? []) m.set(r.id, r)
    return m
  }, [racersQ.data])

  const resultRows = useMemo<ResultRow[]>(() => {
    const race = selectedRace
    const heats = heatsQ.data ?? []
    if (!race || !heats.length) return []

    const racerIds = new Set<number>()
    for (const h of heats) {
      for (const ln of h.lanes) {
        if (ln.racer_id != null) racerIds.add(ln.racer_id)
      }
    }

    const runsByRacer = new Map<number, Run[]>()
    for (const h of heats) {
      // Standings are computed from completed lane times only — pending /
      // in_progress heats may carry stale or partial times that shouldn't
      // contribute to averages, bests, or DNF counts. Matches the backend
      // race_results aggregation (Heat.status == "completed").
      if (h.status !== 'completed') continue
      for (const ln of h.lanes) {
        if (ln.racer_id == null) continue
        const run: Run = {
          heat_number: h.heat_number,
          lane_number: ln.lane_number,
          time_microseconds: ln.time_microseconds ?? null,
          place: ln.place ?? null,
          dnf: ln.dnf ?? false,
        }
        const arr = runsByRacer.get(ln.racer_id) ?? []
        arr.push(run)
        runsByRacer.set(ln.racer_id, arr)
      }
    }

    const laneBestByRacer = new Map<number, Map<number, number>>()
    for (const [racerId, runs] of runsByRacer.entries()) {
      const perLane = new Map<number, number>()
      for (const run of runs) {
        if (run.time_microseconds == null) continue
        const prev = perLane.get(run.lane_number)
        if (prev == null || run.time_microseconds < prev) perLane.set(run.lane_number, run.time_microseconds)
      }
      laneBestByRacer.set(racerId, perLane)
    }

    const rows: ResultRow[] = []
    for (const racerId of [...racerIds].sort((a, b) => a - b)) {
      const racer = racersById.get(racerId)
      if (!racer) continue

      const perLane = laneBestByRacer.get(racerId) ?? new Map<number, number>()
      const lane_times_us = Array.from({ length: race.num_lanes }, (_, i) => perLane.get(i + 1) ?? null)

      const times = lane_times_us.filter((t): t is number => t != null)
      const best_us = times.length ? Math.min(...times) : null
      const average_us = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null

      const runs = (runsByRacer.get(racerId) ?? []).slice().sort((a, b) => {
        const h = a.heat_number - b.heat_number
        if (h !== 0) return h
        return a.lane_number - b.lane_number
      })

      rows.push({
        racer,
        group: racer.group_id != null ? groupsById.get(racer.group_id) ?? null : null,
        lane_times_us,
        average_us,
        best_us,
        place: null,
        runs,
        dnf_count: runs.filter((r) => r.dnf).length,
      })
    }

    // Assign places (overall standings) by avg then best then racer id.
    const scored = rows
      .filter((r) => r.average_us != null)
      .slice()
      .sort((a, b) => (a.average_us ?? 0) - (b.average_us ?? 0) || (a.best_us ?? 0) - (b.best_us ?? 0) || a.racer.id - b.racer.id)

    const placeByRacer = new Map<number, number>()
    for (let i = 0; i < scored.length; i++) placeByRacer.set(scored[i].racer.id, i + 1)

    return rows.map((r) => ({ ...r, place: placeByRacer.get(r.racer.id) ?? null }))
  }, [groupsById, heatsQ.data, racersById, selectedRace])

  const visibleRows = useMemo(() => {
    const filtered = filterGroupId == null ? resultRows : resultRows.filter((r) => r.racer.group_id === filterGroupId)

    // Re-rank within group view.
    const scored = filtered
      .filter((r) => r.average_us != null)
      .slice()
      .sort((a, b) => (a.average_us ?? 0) - (b.average_us ?? 0) || (a.best_us ?? 0) - (b.best_us ?? 0) || a.racer.id - b.racer.id)

    const placeByRacer = new Map<number, number>()
    for (let i = 0; i < scored.length; i++) placeByRacer.set(scored[i].racer.id, i + 1)

    const ranked = filtered.map((r) => ({ ...r, place: placeByRacer.get(r.racer.id) ?? null }))

    const dir = sort.dir === 'asc' ? 1 : -1

    function laneValue(r: ResultRow, laneIdx: number): number {
      const t = r.lane_times_us[laneIdx] ?? null
      return t == null ? Number.POSITIVE_INFINITY : t
    }

    function sortValue(r: ResultRow): number | string {
      if (sort.key === 'place') return r.place ?? Number.POSITIVE_INFINITY
      if (sort.key === 'name') return r.racer.name.toLowerCase()
      if (sort.key === 'group') return (r.group?.name ?? '').toLowerCase()
      if (sort.key === 'avg') return r.average_us ?? Number.POSITIVE_INFINITY
      if (sort.key === 'best') return r.best_us ?? Number.POSITIVE_INFINITY
      if (sort.key.startsWith('lane:')) {
        const idx = Number(sort.key.split(':')[1]) - 1
        return laneValue(r, idx)
      }
      return r.place ?? Number.POSITIVE_INFINITY
    }

    ranked.sort((a, b) => {
      const av = sortValue(a)
      const bv = sortValue(b)
      const primary = cmp(av as never, bv as never) * dir
      if (primary !== 0) return primary
      // Stable-ish tie-breakers.
      return a.racer.id - b.racer.id
    })

    return ranked
  }, [filterGroupId, resultRows, sort.dir, sort.key])

  const stats = useMemo(() => {
    const heats = heatsQ.data ?? []
    const racerIds = new Set<number>()

    let fastest: { time_us: number; racer_id: number; heat_number: number; lane_number: number } | null = null
    let closest: { delta_us: number; heat_number: number } | null = null

    for (const h of heats) {
      // racerIds includes anyone assigned to any heat, regardless of status,
      // so the racer count reflects participation. fastest/closest stats use
      // only completed heats — matches the standings aggregation above.
      for (const ln of h.lanes) {
        if (ln.racer_id != null) racerIds.add(ln.racer_id)
      }
      if (h.status !== 'completed') continue

      const timesInHeat: number[] = []
      for (const ln of h.lanes) {
        if (ln.time_microseconds != null && ln.racer_id != null) {
          const t = ln.time_microseconds
          timesInHeat.push(t)
          if (!fastest || t < fastest.time_us) {
            fastest = { time_us: t, racer_id: ln.racer_id, heat_number: h.heat_number, lane_number: ln.lane_number }
          }
        }
      }

      const sorted = timesInHeat.slice().sort((a, b) => a - b)
      if (sorted.length >= 2) {
        const delta = sorted[1] - sorted[0]
        if (!closest || delta < closest.delta_us) closest = { delta_us: delta, heat_number: h.heat_number }
      }
    }

    const completed = heats.filter((h) => h.status === 'completed').length
    const total = heats.length

    return { racerCount: racerIds.size, completed, total, fastest, closest }
  }, [heatsQ.data])

  async function downloadPdf() {
    if (activeRaceId == null) return
    try {
      const url = buildApiUrl(`/races/${activeRaceId}/export/pdf`, {
        group_id: filterGroupId ?? undefined,
      })

      const res = await fetch(url, { headers: { Accept: 'application/pdf' } })
      if (!res.ok) throw new ApiError(await res.text(), res.status, null)

      const blob = await res.blob()
      const dlName = parseFilenameFromContentDisposition(res.headers.get('content-disposition')) ?? `race-${activeRaceId}-results.pdf`

      const a = document.createElement('a')
      const href = URL.createObjectURL(blob)
      a.href = href
      a.download = dlName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(href)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to download PDF'
      toast({ variant: 'error', title: 'PDF export failed', description: msg })
    }
  }

  const laneCount = selectedRace?.num_lanes ?? 0

  const anyLoading = racesQ.isLoading || groupsQ.isLoading || racersQ.isLoading || heatsQ.isLoading
  const anyError = racesQ.isError || groupsQ.isError || racersQ.isError || heatsQ.isError

  return (
    <div className="space-y-4">
      <Card className="no-print">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Results</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Standings are computed from completed lane times. Use group filter to view per-group placements.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => window.print()} disabled={!visibleRows.length}>
              Print
            </Button>
            <Button variant="secondary" onClick={() => void downloadPdf()} disabled={activeRaceId == null}>
              Export PDF
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="print-only mb-3 hidden">
          <div className="text-lg font-semibold">{selectedRace?.name || 'Results'}</div>
          <div className="text-sm opacity-80">{new Date().toLocaleString()}</div>
        </div>

        <div className="no-print grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-1">
            <label className="text-sm font-semibold">Race</label>
            <select
              value={activeRaceId ?? ''}
              onChange={(e) => setSelectedRaceId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950"
            >
              <option value="">(choose)</option>
              {(racesQ.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold">Group</label>
            <select
              value={filterGroupId ?? ''}
              onChange={(e) => setFilterGroupId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950"
            >
              <option value="">Overall</option>
              {(groupsQ.data ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div className="text-sm text-slate-600 dark:text-slate-300">
            <div>
              Racers: <span className="font-semibold text-slate-900 dark:text-slate-50">{stats.racerCount}</span>
            </div>
            <div>
              Heats: <span className="font-semibold text-slate-900 dark:text-slate-50">{stats.completed}/{stats.total}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="font-semibold">Fastest time</div>
            {stats.fastest ? (
              <div className="mt-1">
                <div className="font-semibold tabular-nums">{formatTimeUs(stats.fastest.time_us)}</div>
                <div className="text-xs opacity-80">
                  {racersById.get(stats.fastest.racer_id)?.name ?? 'Unknown'} • Heat {stats.fastest.heat_number} • Lane {stats.fastest.lane_number}
                </div>
              </div>
            ) : (
              <div className="mt-1 opacity-80">—</div>
            )}
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="font-semibold">Closest finish (per heat)</div>
            {stats.closest ? (
              <div className="mt-1">
                <div className="font-semibold tabular-nums">{formatTimeUs(stats.closest.delta_us)}</div>
                <div className="text-xs opacity-80">Heat {stats.closest.heat_number}</div>
              </div>
            ) : (
              <div className="mt-1 opacity-80">—</div>
            )}
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="font-semibold">Notes</div>
            <div className="mt-1 text-xs opacity-80">
              If a racer has multiple runs in the same lane (repeat heats), we use the best time for that lane.
            </div>
          </div>
        </div>

        <div className="mt-4">
          {anyLoading ? (
            <div className="py-8 text-center text-sm text-slate-600 dark:text-slate-300">Loading…</div>
          ) : visibleRows.length ? (
            <Table className="[&_td]:align-top">
              <thead>
                <tr>
                  <th className="no-print w-12"></th>
                  <th className="w-16">
                    <button type="button" className="font-semibold" onClick={() => setSort((s) => toggleSort(s, 'place'))}>
                      Place
                    </button>
                  </th>
                  <th>
                    <button type="button" className="font-semibold" onClick={() => setSort((s) => toggleSort(s, 'name'))}>
                      Name
                    </button>
                  </th>
                  <th>
                    <button type="button" className="font-semibold" onClick={() => setSort((s) => toggleSort(s, 'group'))}>
                      Group
                    </button>
                  </th>
                  {Array.from({ length: laneCount }, (_, i) => i + 1).map((lane) => (
                    <th key={lane} className="min-w-20">
                      <button type="button" className="font-semibold" onClick={() => setSort((s) => toggleSort(s, `lane:${lane}`))}>
                        L{lane}
                      </button>
                    </th>
                  ))}
                  <th className="min-w-24">
                    <button type="button" className="font-semibold" onClick={() => setSort((s) => toggleSort(s, 'avg'))}>
                      Average
                    </button>
                  </th>
                  <th className="min-w-24">
                    <button type="button" className="font-semibold" onClick={() => setSort((s) => toggleSort(s, 'best'))}>
                      Best
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const expandedNow = expanded.has(r.racer.id)
                  const highlight =
                    r.place === 1
                      ? 'bg-yellow-50 dark:bg-yellow-950/20'
                      : r.place === 2
                        ? 'bg-slate-50 dark:bg-slate-900/40'
                        : r.place === 3
                          ? 'bg-amber-50 dark:bg-amber-950/20'
                          : null

                  return (
                    <Fragment key={r.racer.id}>
                      <tr className={cn(highlight)}>
                        <td className="no-print">
                          <Button
                            variant="ghost"
                            className="px-2"
                            onClick={() =>
                              setExpanded((prev) => {
                                const next = new Set(prev)
                                if (next.has(r.racer.id)) next.delete(r.racer.id)
                                else next.add(r.racer.id)
                                return next
                              })
                            }
                          >
                            {expandedNow ? '−' : '+'}
                          </Button>
                        </td>
                        <td className="font-semibold tabular-nums">{r.place ?? '—'}</td>
                        <td>
                          <div className="font-semibold">{r.racer.name}</div>
                          {carLabel(r.racer) ? <div className="text-xs opacity-80">{carLabel(r.racer)}</div> : null}
                        </td>
                        <td>{r.group?.name ?? '—'}</td>

                        {r.lane_times_us.map((t, idx) => (
                          <td key={idx} className="tabular-nums">
                            {formatTimeUs(t)}
                          </td>
                        ))}

                        <td className="tabular-nums font-semibold">{formatTimeUs(r.average_us)}</td>
                        <td className="tabular-nums">{formatTimeUs(r.best_us)}</td>
                      </tr>

                      {expandedNow ? (
                        <tr className="no-print">
                          <td colSpan={6 + laneCount} className="bg-white dark:bg-slate-900">
                            <div className="py-2">
                              <div className="text-sm font-semibold">Runs</div>
                              {r.runs.length ? (
                                <div className="mt-2 overflow-x-auto">
                                  <table className="w-full border-collapse text-sm">
                                    <thead>
                                      <tr className="[&_th]:border-b [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold">
                                        <th className="w-24">Heat</th>
                                        <th className="w-20">Lane</th>
                                        <th className="w-28">Place</th>
                                        <th>Time</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {r.runs.map((run, i) => (
                                        <tr key={i} className="[&_td]:border-b [&_td]:px-2 [&_td]:py-1">
                                          <td className="tabular-nums">#{run.heat_number}</td>
                                          <td className="tabular-nums">{run.lane_number}</td>
                                          <td className="tabular-nums">{run.place ?? '—'}</td>
                                          <td className="tabular-nums font-semibold">{formatTimeUs(run.time_microseconds)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="mt-1 text-sm opacity-80">No runs.</div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </Table>
          ) : (
            <div className="py-8 text-center text-sm text-slate-600 dark:text-slate-300">
              No results yet. Generate heats and complete some races.
            </div>
          )}

          {anyError ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
              Failed to load results.
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
