import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Table } from '../components/ui/Table'
import { useToast } from '../components/ui/Toast'
import { cn } from '../lib/cn'
import { ApiError } from '../api/client'

import { listGroups } from '../api/endpoints/groups'
import type { Racer } from '../api/endpoints/racers'
import { listRacers } from '../api/endpoints/racers'
import type { Heat, Race } from '../api/endpoints/races'
import { createRace, generateHeats, listHeats, listRaces, reorderHeats, repeatHeat, updateHeat, updateRace } from '../api/endpoints/races'

type DragData =
  | { kind: 'heat-row'; heatId: number }
  | { kind: 'lane'; heatId: number; laneNumber: number; racerId: number }

function formatTimeUs(timeUs: number | null): string {
  if (timeUs == null) return '—'
  const s = timeUs / 1_000_000
  return `${s.toFixed(4)}s`
}

function placeLabel(p: number | null): string {
  if (p == null) return ''
  if (p === 1) return '1st'
  if (p === 2) return '2nd'
  if (p === 3) return '3rd'
  return `${p}th`
}

function statusPill(status: Heat['status']) {
  const base = 'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold'
  if (status === 'completed') return <span className={cn(base, 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200')}>Completed</span>
  if (status === 'in_progress') return <span className={cn(base, 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200')}>In progress</span>
  return <span className={cn(base, 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-200')}>Pending</span>
}

function parseDragData(dt: DataTransfer): DragData | null {
  const raw = dt.getData('application/x-pwdtimer') || dt.getData('text/plain')
  if (!raw) return null
  try {
    const obj = JSON.parse(raw) as DragData
    if (obj && typeof obj === 'object' && 'kind' in obj) return obj
  } catch {
    // ignore
  }
  return null
}

function laneCellLabel(racer: Racer | undefined): string {
  if (!racer) return '—'
  const car = racer.car_name ? (racer.car_number ? `${racer.car_name} (#${racer.car_number})` : racer.car_name) : racer.car_number ? `#${racer.car_number}` : ''
  return car ? `${racer.name} — ${car}` : racer.name
}

export function HeatsPage() {
  const qc = useQueryClient()
  const { toast } = useToast()

  const [selectedRaceId, setSelectedRaceId] = useState<number | null>(null)
  const [scheduleGroupId, setScheduleGroupId] = useState<number | null>(null)

  const [createRaceOpen, setCreateRaceOpen] = useState(false)
  const [raceDraftName, setRaceDraftName] = useState('')
  const [raceDraftLanes, setRaceDraftLanes] = useState(4)

  const [dragOverHeatId, setDragOverHeatId] = useState<number | null>(null)
  const [dragOverLane, setDragOverLane] = useState<{ heatId: number; laneNumber: number } | null>(null)

  const racesQ = useQuery({ queryKey: ['races'], queryFn: listRaces })
  const groupsQ = useQuery({ queryKey: ['groups'], queryFn: listGroups })
  const racersQ = useQuery({ queryKey: ['racers', 'all'], queryFn: () => listRacers() })

  const activeRaceId = useMemo(() => {
    const races = racesQ.data ?? []
    if (races.length === 0) return null
    if (selectedRaceId != null && races.some((r) => r.id === selectedRaceId)) return selectedRaceId
    return races[0].id
  }, [racesQ.data, selectedRaceId])

  const selectedRace = useMemo(() => {
    if (activeRaceId == null) return null
    return (racesQ.data ?? []).find((r) => r.id === activeRaceId) ?? null
  }, [racesQ.data, activeRaceId])

  const heatsQ = useQuery({
    queryKey: ['heats', activeRaceId],
    queryFn: () => listHeats(activeRaceId as number),
    enabled: activeRaceId != null,
  })

  const races = racesQ.data ?? []
  const groups = groupsQ.data ?? []
  const heats = heatsQ.data ?? []

  const racersById = useMemo(() => {
    const m = new Map<number, Racer>()
    for (const r of racersQ.data ?? []) m.set(r.id, r)
    return m
  }, [racersQ.data])

  const heatsById = useMemo(() => {
    const m = new Map<number, Heat>()
    for (const h of heatsQ.data ?? []) m.set(h.id, h)
    return m
  }, [heatsQ.data])

  const progress = useMemo(() => {
    const hs = heatsQ.data ?? []
    const total = hs.length
    const done = hs.filter((h) => h.status === 'completed').length
    return { total, done }
  }, [heatsQ.data])

  const createRaceM = useMutation({
    mutationFn: (payload: { name: string; num_lanes: number }) => createRace(payload),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ['races'] })
      setSelectedRaceId(r.id)
      toast({ variant: 'success', title: 'Race created', description: r.name })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to create race'
      toast({ variant: 'error', title: 'Create race failed', description: msg })
    },
  })

  const updateRaceM = useMutation({
    mutationFn: (args: { id: number; payload: Partial<Race> & { num_lanes?: number } }) => updateRace(args.id, args.payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['races'] })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to update race'
      toast({ variant: 'error', title: 'Update race failed', description: msg })
    },
  })

  const generateHeatsM = useMutation({
    mutationFn: (args: { raceId: number; groupId: number | null }) =>
      generateHeats(args.raceId, args.groupId == null ? undefined : { group_id: args.groupId }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['heats'] })
      toast({ variant: 'success', title: 'Heats generated' })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to generate heats'
      toast({ variant: 'error', title: 'Generate heats failed', description: msg })
    },
  })

  const repeatHeatM = useMutation({
    mutationFn: (heatId: number) => repeatHeat(heatId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['heats'] })
      toast({ variant: 'success', title: 'Heat repeated' })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to repeat heat'
      toast({ variant: 'error', title: 'Repeat heat failed', description: msg })
    },
  })

  const reorderHeatsM = useMutation({
    mutationFn: (args: { raceId: number; heatIds: number[] }) => reorderHeats(args.raceId, args.heatIds),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['heats'] })
      toast({ variant: 'success', title: 'Heats reordered' })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to reorder heats'
      toast({ variant: 'error', title: 'Reorder failed', description: msg })
    },
  })

  const updateHeatM = useMutation({
    mutationFn: (args: { heatId: number; payload: Parameters<typeof updateHeat>[1] }) => updateHeat(args.heatId, args.payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['heats'] })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to update heat'
      toast({ variant: 'error', title: 'Update heat failed', description: msg })
    },
  })

  async function submitCreateRace() {
    const name = raceDraftName.trim()
    if (!name) {
      toast({ variant: 'error', title: 'Race name is required' })
      return
    }

    try {
      await createRaceM.mutateAsync({ name, num_lanes: raceDraftLanes })
      setCreateRaceOpen(false)
      setRaceDraftName('')
    } catch {
      // error is toasted
    }
  }

  async function reorder(heatId: number, beforeHeatId: number) {
    if (activeRaceId == null) return
    const ids = heats.map((h) => h.id)
    const from = ids.indexOf(heatId)
    const to = ids.indexOf(beforeHeatId)
    if (from < 0 || to < 0 || from === to) return

    const next = [...ids]
    next.splice(from, 1)
    next.splice(to, 0, heatId)

    try {
      await reorderHeatsM.mutateAsync({ raceId: activeRaceId, heatIds: next })
    } catch {
      // toasted
    }
  }

  async function swapLaneAssignment(src: { heatId: number; laneNumber: number; racerId: number }, dst: { heatId: number; laneNumber: number }) {
    const srcHeat = heatsById.get(src.heatId)
    const dstHeat = heatsById.get(dst.heatId)
    if (!srcHeat || !dstHeat) return
    if (srcHeat.status !== 'pending' || dstHeat.status !== 'pending') {
      toast({ variant: 'info', title: 'Assignments can only be changed while heats are pending.' })
      return
    }

    const srcLane = srcHeat.lanes.find((l) => l.lane_number === src.laneNumber)
    const dstLane = dstHeat.lanes.find((l) => l.lane_number === dst.laneNumber)
    if (!srcLane || !dstLane) return

    const srcRacerId = srcLane.racer_id
    const dstRacerId = dstLane.racer_id
    if (srcRacerId == null) return

    if (src.heatId === dst.heatId) {
      if (src.laneNumber === dst.laneNumber) return
      await updateHeatM.mutateAsync({
        heatId: src.heatId,
        payload: {
          lanes: [
            { lane_number: src.laneNumber, racer_id: dstRacerId },
            { lane_number: dst.laneNumber, racer_id: srcRacerId },
          ],
        },
      })
      return
    }

    // Move across heats; swap if target occupied.
    await Promise.all([
      updateHeatM.mutateAsync({ heatId: src.heatId, payload: { lanes: [{ lane_number: src.laneNumber, racer_id: dstRacerId }] } }),
      updateHeatM.mutateAsync({ heatId: dst.heatId, payload: { lanes: [{ lane_number: dst.laneNumber, racer_id: srcRacerId }] } }),
    ])
  }

  const anyLoading = racesQ.isLoading || heatsQ.isLoading || groupsQ.isLoading || racersQ.isLoading

  return (
    <div className="space-y-4">
      <Card className="no-print">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Heats</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Generate and manage heat schedules. Drag rows to reorder; drag racers between lanes to override assignments.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => window.print()} disabled={!heats.length}>
              Print heat sheet
            </Button>
            <Button variant="secondary" onClick={() => setCreateRaceOpen(true)}>
              + New race
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="no-print">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-semibold">Race</label>
              <select
                value={activeRaceId ?? ''}
                onChange={(e) => setSelectedRaceId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950"
              >
                <option value="">(choose)</option>
                {races.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedRace ? (
              <div className="grid grid-cols-1 gap-2">
                <div className="space-y-1">
                  <label className="text-sm font-semibold">Lane count</label>
                  <select
                    value={selectedRace.num_lanes}
                    onChange={(e) =>
                      updateRaceM.mutate({ id: selectedRace.id, payload: { num_lanes: Number(e.target.value) } })
                    }
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950"
                  >
                    {[4, 6, 8].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    Changing lane count affects the schedule; regenerate heats after changing.
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-semibold">Schedule group (optional)</label>
                  <select
                    value={scheduleGroupId ?? ''}
                    onChange={(e) => setScheduleGroupId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950"
                  >
                    <option value="">All racers</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                <Button
                  onClick={() =>
                    activeRaceId != null ? generateHeatsM.mutate({ raceId: activeRaceId, groupId: scheduleGroupId }) : null
                  }
                  disabled={activeRaceId == null || generateHeatsM.isPending}
                >
                  {generateHeatsM.isPending ? 'Generating…' : 'Generate heats'}
                </Button>

                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">Progress</div>
                    <div className="text-slate-700 dark:text-slate-200">
                      {progress.done}/{progress.total}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    Completed heats out of total.
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-600 dark:text-slate-300">Create a race to begin scheduling heats.</div>
            )}

            {racesQ.isError ? <div className="text-sm text-red-600">{(racesQ.error as Error).message}</div> : null}
            {heatsQ.isError ? <div className="text-sm text-red-600">{(heatsQ.error as Error).message}</div> : null}
          </div>
        </Card>

        <Card>
          <div className="print-only mb-3 hidden">
            <div className="text-lg font-semibold">{selectedRace?.name || 'Heat Sheet'}</div>
            <div className="text-sm opacity-80">{new Date().toLocaleString()}</div>
          </div>

          {anyLoading ? (
            <div className="py-8 text-center text-sm text-slate-600 dark:text-slate-300">Loading…</div>
          ) : heats.length ? (
            <div className="space-y-4">
              <div className="no-print text-xs text-slate-600 dark:text-slate-300">
                Tip: drag a racer cell onto another lane cell to swap/move assignments (pending heats only).
              </div>

              <Table className="[&_td]:align-top">
                <thead>
                  <tr>
                    <th className="w-20">Heat</th>
                    <th className="w-28">Status</th>
                    <th>Lanes</th>
                    <th className="no-print w-28">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {heats.map((h) => (
                    <tr
                      key={h.id}
                      draggable
                      onDragStart={(e) => {
                        const payload: DragData = { kind: 'heat-row', heatId: h.id }
                        e.dataTransfer.setData('application/x-pwdtimer', JSON.stringify(payload))
                        e.dataTransfer.setData('text/plain', JSON.stringify(payload))
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragOver={(e) => {
                        const d = parseDragData(e.dataTransfer)
                        if (!d || d.kind !== 'heat-row' || d.heatId === h.id) return
                        e.preventDefault()
                        setDragOverHeatId(h.id)
                      }}
                      onDragLeave={() => setDragOverHeatId(null)}
                      onDrop={(e) => {
                        const d = parseDragData(e.dataTransfer)
                        setDragOverHeatId(null)
                        if (!d || d.kind !== 'heat-row') return
                        e.preventDefault()
                        void reorder(d.heatId, h.id)
                      }}
                      className={cn(dragOverHeatId === h.id ? 'ring-2 ring-blue-500' : null)}
                      title="Drag to reorder heats"
                    >
                      <td>
                        <div className="font-semibold">#{h.heat_number}</div>
                      </td>
                      <td>{statusPill(h.status)}</td>
                      <td>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {[...h.lanes]
                            .sort((a, b) => a.lane_number - b.lane_number)
                            .map((ln) => {
                              const racer = ln.racer_id == null ? undefined : racersById.get(ln.racer_id)
                              const isDraggable = h.status === 'pending' && ln.racer_id != null

                              return (
                                <div
                                  key={ln.id}
                                  className={cn(
                                    'rounded-md border border-slate-200 p-2 text-sm dark:border-slate-800',
                                    dragOverLane?.heatId === h.id && dragOverLane.laneNumber === ln.lane_number
                                      ? 'ring-2 ring-blue-500'
                                      : null,
                                  )}
                                  draggable={isDraggable}
                                  onDragStart={(e) => {
                                    if (!isDraggable || ln.racer_id == null) return
                                    const payload: DragData = {
                                      kind: 'lane',
                                      heatId: h.id,
                                      laneNumber: ln.lane_number,
                                      racerId: ln.racer_id,
                                    }
                                    e.dataTransfer.setData('application/x-pwdtimer', JSON.stringify(payload))
                                    e.dataTransfer.setData('text/plain', JSON.stringify(payload))
                                    e.dataTransfer.effectAllowed = 'move'
                                  }}
                                  onDragOver={(e) => {
                                    const d = parseDragData(e.dataTransfer)
                                    if (!d || d.kind !== 'lane') return
                                    e.preventDefault()
                                    setDragOverLane({ heatId: h.id, laneNumber: ln.lane_number })
                                  }}
                                  onDragLeave={() => setDragOverLane(null)}
                                  onDrop={(e) => {
                                    const d = parseDragData(e.dataTransfer)
                                    setDragOverLane(null)
                                    if (!d || d.kind !== 'lane') return
                                    e.preventDefault()
                                    void swapLaneAssignment(
                                      { heatId: d.heatId, laneNumber: d.laneNumber, racerId: d.racerId },
                                      { heatId: h.id, laneNumber: ln.lane_number },
                                    )
                                  }}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="font-semibold">Lane {ln.lane_number}</div>
                                    <div className="text-xs text-slate-600 dark:text-slate-300">
                                      {placeLabel(ln.place) ? <span className="mr-2">{placeLabel(ln.place)}</span> : null}
                                      {ln.time_microseconds != null ? <span>{formatTimeUs(ln.time_microseconds)}</span> : null}
                                    </div>
                                  </div>
                                  <div className={cn('mt-1', ln.racer_id == null ? 'text-slate-500' : null)}>{laneCellLabel(racer)}</div>
                                </div>
                              )
                            })}
                        </div>
                      </td>
                      <td className="no-print">
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => repeatHeatM.mutate(h.id)}
                            disabled={repeatHeatM.isPending}
                          >
                            Repeat
                          </Button>
                          {h.status !== 'pending' ? (
                            <Button
                              variant="ghost"
                              onClick={() => updateHeatM.mutate({ heatId: h.id, payload: { status: 'pending' } })}
                            >
                              Reset
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-slate-600 dark:text-slate-300">
              No heats yet. Create a race and click “Generate heats”.
            </div>
          )}
        </Card>
      </div>

      <Modal open={createRaceOpen} title="Create race" onClose={() => setCreateRaceOpen(false)}>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <input
              value={raceDraftName}
              onChange={(e) => setRaceDraftName(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Lane count</label>
            <select
              value={raceDraftLanes}
              onChange={(e) => setRaceDraftLanes(Number(e.target.value))}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950"
            >
              {[4, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateRaceOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitCreateRace()} disabled={createRaceM.isPending}>
              {createRaceM.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
