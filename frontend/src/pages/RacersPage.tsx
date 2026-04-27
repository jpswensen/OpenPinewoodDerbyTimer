import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Papa from 'papaparse'

import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Table } from '../components/ui/Table'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import { cn } from '../lib/cn'
import { ApiError } from '../api/client'

import type { Group } from '../api/endpoints/groups'
import { createGroup, deleteGroup, listGroups, updateGroup } from '../api/endpoints/groups'
import type { Racer, RacerCreate, RacerUpdate } from '../api/endpoints/racers'
import { createRacer, deleteRacer, listRacers, updateRacer } from '../api/endpoints/racers'
import { exportRacersCsv, importRacersCsv } from '../api/endpoints/importExport'

type CsvRow = Record<string, string>

type GroupDraft = { name: string; description: string }

type RacerDraft = {
  name: string
  car_name: string
  car_number: string
}

type CsvMapping = {
  nameKey: string
  carNameKey: string | null
  carNumberKey: string | null
  groupKey: string | null
}

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '')
}

function guessKey(fields: string[], candidates: string[]): string | null {
  const want = new Set(candidates.map(normKey))
  for (const f of fields) {
    if (want.has(normKey(f))) return f
  }
  return null
}

function csvEscape(v: string): string {
  if (v.includes('"')) v = v.replaceAll('"', '""')
  if (/[\n\r,"]/.test(v)) return `"${v}"`
  return v
}

function downloadTextFile(filename: string, content: string, mime = 'text/plain; charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function groupLabel(g: Group | null): string {
  return g ? g.name : 'All'
}

export function RacersPage() {
  const qc = useQueryClient()
  const { toast } = useToast()

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [dragOverGroupId, setDragOverGroupId] = useState<number | 'all' | null>(null)

  const [search, setSearch] = useState('')

  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())

  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [groupModalMode, setGroupModalMode] = useState<'create' | 'edit'>('create')
  const [groupDraft, setGroupDraft] = useState<GroupDraft>({ name: '', description: '' })
  const [groupEditing, setGroupEditing] = useState<Group | null>(null)
  const [groupDeleteConfirm, setGroupDeleteConfirm] = useState<Group | null>(null)
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(() => new Set())
  const [bulkGroupDeleteConfirmOpen, setBulkGroupDeleteConfirmOpen] = useState(false)

  const [racerDraft, setRacerDraft] = useState<RacerDraft>({ name: '', car_name: '', car_number: '' })
  const [racerEditingId, setRacerEditingId] = useState<number | null>(null)
  const [racerEditDraft, setRacerEditDraft] = useState<RacerDraft>({ name: '', car_name: '', car_number: '' })
  const [racerDeleteConfirm, setRacerDeleteConfirm] = useState<Racer | null>(null)
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false)

  const [csvModalOpen, setCsvModalOpen] = useState(false)
  const csvFileRef = useRef<HTMLInputElement>(null)
  const [csvFields, setCsvFields] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [csvMapping, setCsvMapping] = useState<CsvMapping>({
    nameKey: '',
    carNameKey: null,
    carNumberKey: null,
    groupKey: null,
  })
  const [csvParseError, setCsvParseError] = useState<string | null>(null)
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvExporting, setCsvExporting] = useState(false)

  const groupsQ = useQuery({
    queryKey: ['groups'],
    queryFn: listGroups,
  })

  const racersQ = useQuery({
    queryKey: ['racers', selectedGroupId],
    queryFn: () => listRacers(selectedGroupId == null ? undefined : { group_id: selectedGroupId }),
  })

  const groups = useMemo(() => groupsQ.data ?? [], [groupsQ.data])
  const racers = useMemo(() => racersQ.data ?? [], [racersQ.data])

  const selectedGroup = useMemo(() => {
    if (selectedGroupId == null) return null
    return groups.find((g) => g.id === selectedGroupId) ?? null
  }, [groups, selectedGroupId])

  useEffect(() => {
    // Keep selection consistent with currently loaded rows.
    const ids = new Set(racers.map((r) => r.id))
    setSelectedIds((prev) => new Set([...prev].filter((id) => ids.has(id))))
  }, [racers])

  useEffect(() => {
    // Drop group selections that no longer exist (e.g., after delete).
    const ids = new Set(groups.map((g) => g.id))
    setSelectedGroupIds((prev) => new Set([...prev].filter((id) => ids.has(id))))
  }, [groups])

  const visibleRacers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return racers
    return racers.filter((r) => {
      const hay = [r.name, r.car_name ?? '', r.car_number ?? ''].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [racers, search])

  const createGroupM = useMutation({
    mutationFn: (payload: { name: string; description: string | null }) =>
      createGroup({ name: payload.name, description: payload.description }),
    onSuccess: async (g) => {
      await qc.invalidateQueries({ queryKey: ['groups'] })
      setSelectedGroupId(g.id)
      toast({ variant: 'success', title: 'Group created', description: g.name })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to create group'
      toast({ variant: 'error', title: 'Create group failed', description: msg })
    },
  })

  const updateGroupM = useMutation({
    mutationFn: (args: { id: number; payload: { name?: string; description?: string | null } }) =>
      updateGroup(args.id, args.payload),
    onSuccess: async (g) => {
      await qc.invalidateQueries({ queryKey: ['groups'] })
      toast({ variant: 'success', title: 'Group updated', description: g.name })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to update group'
      toast({ variant: 'error', title: 'Update group failed', description: msg })
    },
  })

  const deleteGroupM = useMutation({
    mutationFn: (id: number) => deleteGroup(id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['groups'] }),
        qc.invalidateQueries({ queryKey: ['racers'] }),
      ])
      toast({ variant: 'success', title: 'Group deleted' })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to delete group'
      toast({ variant: 'error', title: 'Delete group failed', description: msg })
    },
  })

  const createRacerM = useMutation({
    mutationFn: (payload: RacerCreate) => createRacer(payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['racers'] })
      setRacerDraft({ name: '', car_name: '', car_number: '' })
      toast({ variant: 'success', title: 'Racer added' })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to add racer'
      toast({ variant: 'error', title: 'Add racer failed', description: msg })
    },
  })

  const updateRacerM = useMutation({
    mutationFn: (args: { id: number; payload: RacerUpdate }) => updateRacer(args.id, args.payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['racers'] })
      toast({ variant: 'success', title: 'Racer updated' })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to update racer'
      toast({ variant: 'error', title: 'Update racer failed', description: msg })
    },
  })

  const moveRacersM = useMutation({
    mutationFn: async (args: { ids: number[]; group_id: number | null }) => {
      await Promise.all(args.ids.map((id) => updateRacer(id, { group_id: args.group_id })))
    },
    onSuccess: async (_data, vars) => {
      await qc.invalidateQueries({ queryKey: ['racers'] })
      toast({
        variant: 'success',
        title: `Moved ${vars.ids.length} racer(s)`,
        description: vars.group_id == null ? 'Unassigned from group.' : 'Updated group assignment.',
      })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to move racer(s)'
      toast({ variant: 'error', title: 'Move failed', description: msg })
    },
  })

  const deleteRacerM = useMutation({
    mutationFn: (id: number) => deleteRacer(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['racers'] })
      toast({ variant: 'success', title: 'Racer deleted' })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to delete racer'
      toast({ variant: 'error', title: 'Delete racer failed', description: msg })
    },
  })

  function openCreateGroup() {
    setGroupModalMode('create')
    setGroupDraft({ name: '', description: '' })
    setGroupEditing(null)
    setGroupModalOpen(true)
  }

  function openEditGroup(g: Group) {
    setGroupModalMode('edit')
    setGroupEditing(g)
    setGroupDraft({ name: g.name, description: g.description ?? '' })
    setGroupModalOpen(true)
  }

  async function submitGroup() {
    const name = groupDraft.name.trim()
    const description = groupDraft.description.trim() || null
    if (!name) {
      toast({ variant: 'error', title: 'Group name is required' })
      return
    }

    if (groupModalMode === 'create') {
      try {
        await createGroupM.mutateAsync({ name, description })
        setGroupModalOpen(false)
      } catch {
        // errors are toasted by the mutation
      }
      return
    }

    if (groupEditing) {
      try {
        await updateGroupM.mutateAsync({ id: groupEditing.id, payload: { name, description } })
        setGroupModalOpen(false)
      } catch {
        // errors are toasted by the mutation
      }
    }
  }

  function toggleSelected(id: number, next?: boolean) {
    setSelectedIds((prev) => {
      const copy = new Set(prev)
      const shouldSelect = next ?? !copy.has(id)
      if (shouldSelect) copy.add(id)
      else copy.delete(id)
      return copy
    })
  }

  function toggleSelectAllVisible(next: boolean) {
    setSelectedIds((prev) => {
      const copy = new Set(prev)
      if (next) {
        for (const r of visibleRacers) copy.add(r.id)
      } else {
        for (const r of visibleRacers) copy.delete(r.id)
      }
      return copy
    })
  }

  function startEditRacer(r: Racer) {
    setRacerEditingId(r.id)
    setRacerEditDraft({
      name: r.name,
      car_name: r.car_name ?? '',
      car_number: r.car_number ?? '',
    })
  }

  async function saveEditRacer(r: Racer) {
    const name = racerEditDraft.name.trim()
    if (!name) {
      toast({ variant: 'error', title: 'Racer name is required' })
      return
    }

    try {
      await updateRacerM.mutateAsync({
        id: r.id,
        payload: {
          name,
          car_name: racerEditDraft.car_name.trim() || null,
          car_number: racerEditDraft.car_number.trim() || null,
        },
      })
      setRacerEditingId(null)
    } catch {
      // errors are toasted by the mutation
    }
  }

  function getDraggedRacerIds(e: DragEvent): number[] {
    const json = e.dataTransfer.getData('application/json')
    if (json) {
      try {
        const parsed: unknown = JSON.parse(json)
        if (typeof parsed === 'object' && parsed && 'ids' in parsed) {
          const ids = (parsed as { ids?: unknown }).ids
          if (Array.isArray(ids)) {
            return ids.map((x) => Number(x)).filter((n) => Number.isFinite(n))
          }
        }
      } catch {
        // ignore
      }
    }

    const raw = e.dataTransfer.getData('text/plain')
    const id = Number(raw)
    return Number.isFinite(id) ? [id] : []
  }

  function dropRacersToGroup(e: DragEvent, groupId: number | null) {
    e.preventDefault()
    setDragOverGroupId(null)
    const ids = getDraggedRacerIds(e)
    if (!ids.length) return
    moveRacersM.mutate({ ids, group_id: groupId })
  }

  function parseCsv(file: File) {
    setCsvParseError(null)
    setCsvFields([])
    setCsvRows([])

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: Papa.ParseResult<CsvRow>) => {
        const fields = results.meta.fields ?? []
        if (!fields.length) {
          setCsvParseError('CSV must include a header row')
          return
        }

        const rows = (results.data ?? []).filter((row: CsvRow) =>
          Object.values(row).some((v) => String(v ?? '').trim()),
        )
        setCsvFields(fields)
        setCsvRows(rows)

        const nameKey = guessKey(fields, ['name', 'racer', 'racer name'])
        const carNameKey = guessKey(fields, ['car name', 'car', 'carname'])
        const carNumberKey = guessKey(fields, ['car number', 'number', 'car #', 'carnumber'])
        const groupKey = guessKey(fields, ['group', 'group name', 'group_name'])

        setCsvMapping({
          nameKey: nameKey ?? '',
          carNameKey,
          carNumberKey,
          groupKey,
        })
      },
      error: (err: Error) => {
        setCsvParseError(err.message)
      },
    })
  }

  const csvPreview = useMemo(() => {
    if (!csvRows.length) return []
    const take = csvRows.slice(0, 10)

    function get(row: CsvRow, k: string | null): string {
      if (!k) return ''
      return String(row[k] ?? '').trim()
    }

    return take.map((row) => ({
      name: get(row, csvMapping.nameKey || null),
      car_name: get(row, csvMapping.carNameKey),
      car_number: get(row, csvMapping.carNumberKey),
      group: get(row, csvMapping.groupKey),
    }))
  }, [csvMapping, csvRows])

  async function importCsvNow() {
    if (!csvRows.length) {
      toast({ variant: 'error', title: 'Choose a CSV file first' })
      return
    }
    if (!csvMapping.nameKey) {
      toast({ variant: 'error', title: 'Mapping required', description: 'Please map the Name column.' })
      return
    }

    setCsvImporting(true)
    try {
      const lines: string[] = []
      lines.push(['name', 'car_name', 'car_number', 'group'].join(','))

      for (const row of csvRows) {
        const name = String(row[csvMapping.nameKey] ?? '')
        const carName = csvMapping.carNameKey ? String(row[csvMapping.carNameKey] ?? '') : ''
        const carNumber = csvMapping.carNumberKey ? String(row[csvMapping.carNumberKey] ?? '') : ''
        const group = csvMapping.groupKey ? String(row[csvMapping.groupKey] ?? '') : ''

        lines.push([name, carName, carNumber, group].map((v) => csvEscape(v.trim())).join(','))
      }

      const csvText = `${lines.join('\n')}\n`
      const file = new File([csvText], 'racers-import.csv', { type: 'text/csv' })
      const res = await importRacersCsv(file)

      await Promise.all([
        qc.invalidateQueries({ queryKey: ['groups'] }),
        qc.invalidateQueries({ queryKey: ['racers'] }),
      ])

      const errCount = res.errors?.length ?? 0
      toast({
        variant: errCount ? 'info' : 'success',
        title: `Imported ${res.racers_created} racers`,
        description: errCount ? `${errCount} row(s) had errors.` : `Created ${res.groups_created} group(s).`,
      })

      setCsvModalOpen(false)
      setCsvRows([])
      setCsvFields([])
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'CSV import failed'
      toast({ variant: 'error', title: 'CSV import failed', description: msg })
    } finally {
      setCsvImporting(false)
    }
  }

  function exportVisibleCsv() {
    const rows = visibleRacers

    const lines: string[] = []
    lines.push(['name', 'car_name', 'car_number', 'group'].join(','))

    for (const r of rows) {
      const g = r.group_id == null ? '' : groups.find((x) => x.id === r.group_id)?.name ?? ''
      lines.push(
        [r.name, r.car_name ?? '', r.car_number ?? '', g].map((v) => csvEscape(String(v))).join(','),
      )
    }

    downloadTextFile('racers.csv', `${lines.join('\n')}\n`, 'text/csv; charset=utf-8')
  }

  async function exportCsv() {
    if (csvExporting) return

    // If the user is viewing “All” with no search filter, prefer the backend export.
    if (selectedGroupId == null && !search.trim()) {
      setCsvExporting(true)
      try {
        const csv = await exportRacersCsv()
        downloadTextFile('racers.csv', csv, 'text/csv; charset=utf-8')
        toast({ variant: 'success', title: 'CSV exported' })
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : 'CSV export failed'
        toast({ variant: 'error', title: 'CSV export failed', description: msg })
      } finally {
        setCsvExporting(false)
      }
      return
    }

    exportVisibleCsv()
  }

  function toggleGroupSelected(id: number, next?: boolean) {
    setSelectedGroupIds((prev) => {
      const copy = new Set(prev)
      const shouldSelect = next ?? !copy.has(id)
      if (shouldSelect) copy.add(id)
      else copy.delete(id)
      return copy
    })
  }

  async function deleteSelectedGroups() {
    const ids = [...selectedGroupIds]
    if (!ids.length) return

    try {
      await Promise.all(ids.map((id) => deleteGroup(id)))
      const deleted = new Set(ids)
      if (selectedGroupId != null && deleted.has(selectedGroupId)) {
        setSelectedGroupId(null)
      }
      setSelectedGroupIds(new Set())
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['groups'] }),
        qc.invalidateQueries({ queryKey: ['racers'] }),
      ])
      toast({
        variant: 'success',
        title: `Deleted ${ids.length} group(s)`,
        description: 'Racers from those groups are kept and now appear under All.',
      })
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Bulk delete failed'
      toast({ variant: 'error', title: 'Delete groups failed', description: msg })
    }
  }

  async function deleteSelectedRacers() {
    const ids = [...selectedIds]
    if (!ids.length) return

    try {
      await Promise.all(ids.map((id) => deleteRacer(id)))
      setSelectedIds(new Set())
      await qc.invalidateQueries({ queryKey: ['racers'] })
      toast({ variant: 'success', title: `Deleted ${ids.length} racer(s)` })
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Bulk delete failed'
      toast({ variant: 'error', title: 'Bulk delete failed', description: msg })
    }
  }

  const anyLoading = groupsQ.isLoading || racersQ.isLoading

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Racers</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Manage groups and participants. Drag racers (or your current selection) onto a group on the left to move
              them — works from the “All” list and from any sub-group. Drop onto “All” to unassign. Deleting a group
              keeps its racers (they fall back to “All”).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setCsvModalOpen(true)}>
              Import CSV
            </Button>
            <Button
              variant="secondary"
              onClick={() => void exportCsv()}
              disabled={csvExporting || (selectedGroupId != null || search.trim() ? !visibleRacers.length : false)}
            >
              {csvExporting ? 'Exporting…' : 'Export CSV'}
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Groups</div>
            <div className="flex items-center gap-1">
              {selectedGroupIds.size > 0 ? (
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                  onClick={() => setBulkGroupDeleteConfirmOpen(true)}
                  aria-label={`Delete ${selectedGroupIds.size} selected group(s)`}
                >
                  Delete ({selectedGroupIds.size})
                </Button>
              ) : null}
              <Button variant="ghost" onClick={openCreateGroup}>
                + Add
              </Button>
            </div>
          </div>

          {groupsQ.isError ? (
            <div className="text-sm text-red-600">{groupsQ.error instanceof Error ? groupsQ.error.message : 'Failed to load groups'}</div>
          ) : null}

          <div className="mt-2 space-y-1">
            <button
              type="button"
              className={cn(
                'w-full rounded-md px-2 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800',
                selectedGroupId == null ? 'bg-slate-100 font-semibold dark:bg-slate-800' : null,
                dragOverGroupId === 'all' ? 'ring-2 ring-blue-500' : null,
              )}
              onClick={() => setSelectedGroupId(null)}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOverGroupId('all')
              }}
              onDragLeave={() => setDragOverGroupId(null)}
              onDrop={(e) => dropRacersToGroup(e, null)}
              title="Drop racers here to unassign from any group"
            >
              All
            </button>

            {groups.map((g) => (
              <div
                key={g.id}
                className={cn(
                  'group flex items-center gap-2 rounded-md px-2 py-2 hover:bg-slate-100 dark:hover:bg-slate-800',
                  selectedGroupId === g.id ? 'bg-slate-100 font-semibold dark:bg-slate-800' : null,
                  dragOverGroupId === g.id ? 'ring-2 ring-blue-500' : null,
                )}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverGroupId(g.id)
                }}
                onDragLeave={() => setDragOverGroupId(null)}
                onDrop={(e) => dropRacersToGroup(e, g.id)}
              >
                <input
                  type="checkbox"
                  checked={selectedGroupIds.has(g.id)}
                  onChange={(e) => toggleGroupSelected(g.id, e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select group ${g.name}`}
                  className="shrink-0"
                />
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-sm"
                  onClick={() => setSelectedGroupId(g.id)}
                  title={g.name}
                >
                  {g.name}
                </button>

                <div className="hidden gap-1 group-hover:flex">
                  <Button
                    variant="ghost"
                    className="px-2 py-1"
                    onClick={() => {
                      openEditGroup(g)
                    }}
                    aria-label={`Edit group ${g.name}`}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2 py-1"
                    onClick={() => setGroupDeleteConfirm(g)}
                    aria-label={`Delete group ${g.name}`}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Group: {groupLabel(selectedGroup)}</div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {visibleRacers.length} racer(s)
                {search.trim() ? ` (filtered from ${racers.length})` : ''}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name / car / number"
                className="w-[min(320px,100%)] rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950"
              />

              <Button
                variant="secondary"
                disabled={!selectedIds.size}
                onClick={() => setBulkDeleteConfirmOpen(true)}
              >
                Delete selected ({selectedIds.size})
              </Button>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="mb-2 text-sm font-semibold">Add racer</div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px_auto]">
              <input
                value={racerDraft.name}
                onChange={(e) => setRacerDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Name (required)"
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950"
              />
              <input
                value={racerDraft.car_name}
                onChange={(e) => setRacerDraft((d) => ({ ...d, car_name: e.target.value }))}
                placeholder="Car name"
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950"
              />
              <input
                value={racerDraft.car_number}
                onChange={(e) => setRacerDraft((d) => ({ ...d, car_number: e.target.value }))}
                placeholder="Car #"
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950"
              />

              <Button
                onClick={() => {
                  const name = racerDraft.name.trim()
                  if (!name) {
                    toast({ variant: 'error', title: 'Racer name is required' })
                    return
                  }
                  const payload: RacerCreate = {
                    name,
                    car_name: racerDraft.car_name.trim() || null,
                    car_number: racerDraft.car_number.trim() || null,
                    group_id: selectedGroupId,
                  }
                  createRacerM.mutate(payload)
                }}
                disabled={createRacerM.isPending}
              >
                Add
              </Button>
            </div>
          </div>

          {racersQ.isError ? (
            <div className="mt-3 text-sm text-red-600">{racersQ.error instanceof Error ? racersQ.error.message : 'Failed to load racers'}</div>
          ) : null}

          <div className="mt-4">
            <Table>
              <thead>
                <tr>
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={visibleRacers.length > 0 && visibleRacers.every((r) => selectedIds.has(r.id))}
                      onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                      aria-label="Select all"
                    />
                  </th>
                  <th>Name</th>
                  <th>Car</th>
                  <th className="w-28">Car #</th>
                  <th className="w-24">Status</th>
                  <th className="w-40">Actions</th>
                </tr>
              </thead>
              <tbody>
                {anyLoading ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-sm text-slate-600 dark:text-slate-300">
                      Loading…
                    </td>
                  </tr>
                ) : visibleRacers.length ? (
                  visibleRacers.map((r) => {
                    const isEditing = racerEditingId === r.id

                    return (
                      <tr
                        key={r.id}
                        draggable
                        onDragStart={(e) => {
                          const ids = selectedIds.has(r.id) ? [...selectedIds] : [r.id]
                          e.dataTransfer.setData('application/json', JSON.stringify({ ids }))
                          e.dataTransfer.setData('text/plain', String(r.id))
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        className={cn('cursor-move', r.disabled ? 'opacity-50' : null)}
                        title={selectedIds.has(r.id) && selectedIds.size > 1 ? 'Drag selection onto a group to move' : 'Drag onto a group to move'}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(r.id)}
                            onChange={(e) => toggleSelected(r.id, e.target.checked)}
                            aria-label={`Select ${r.name}`}
                          />
                        </td>

                        <td className="align-top">
                          {isEditing ? (
                            <input
                              value={racerEditDraft.name}
                              onChange={(e) => setRacerEditDraft((d) => ({ ...d, name: e.target.value }))}
                              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950"
                            />
                          ) : (
                            <div className="font-medium">{r.name}</div>
                          )}
                        </td>

                        <td className="align-top">
                          {isEditing ? (
                            <input
                              value={racerEditDraft.car_name}
                              onChange={(e) =>
                                setRacerEditDraft((d) => ({ ...d, car_name: e.target.value }))
                              }
                              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950"
                            />
                          ) : (
                            <div className="text-sm text-slate-700 dark:text-slate-200">{r.car_name || '—'}</div>
                          )}
                        </td>

                        <td className="align-top">
                          {isEditing ? (
                            <input
                              value={racerEditDraft.car_number}
                              onChange={(e) =>
                                setRacerEditDraft((d) => ({ ...d, car_number: e.target.value }))
                              }
                              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950"
                            />
                          ) : (
                            <div className="text-sm text-slate-700 dark:text-slate-200">{r.car_number || '—'}</div>
                          )}
                        </td>

                        <td className="align-top">
                          <button
                            type="button"
                            onClick={() =>
                              updateRacerM.mutate({ id: r.id, payload: { disabled: !r.disabled } })
                            }
                            className={cn(
                              'rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
                              r.disabled
                                ? 'bg-slate-200 text-slate-500 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600'
                                : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50',
                            )}
                          >
                            {r.disabled ? 'No-show' : 'Active'}
                          </button>
                        </td>

                        <td className="align-top">
                          {isEditing ? (
                            <div className="flex flex-wrap gap-2">
                              <Button variant="secondary" onClick={() => void saveEditRacer(r)}>
                                Save
                              </Button>
                              <Button variant="ghost" onClick={() => setRacerEditingId(null)}>
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <Button variant="ghost" onClick={() => startEditRacer(r)}>
                                Edit
                              </Button>
                              <Button variant="ghost" onClick={() => setRacerDeleteConfirm(r)}>
                                Delete
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-sm text-slate-600 dark:text-slate-300">
                      No racers.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
        </Card>
      </div>

      <Modal
        open={groupModalOpen}
        title={groupModalMode === 'create' ? 'Add group' : 'Edit group'}
        onClose={() => setGroupModalOpen(false)}
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <input
              value={groupDraft.name}
              onChange={(e) => setGroupDraft((d) => ({ ...d, name: e.target.value }))}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Description</label>
            <input
              value={groupDraft.description}
              onChange={(e) => setGroupDraft((d) => ({ ...d, description: e.target.value }))}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setGroupModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitGroup()} disabled={createGroupM.isPending || updateGroupM.isPending}>
              Save
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={groupDeleteConfirm != null}
        title={groupDeleteConfirm ? `Delete group: ${groupDeleteConfirm.name}` : 'Delete group'}
        onClose={() => setGroupDeleteConfirm(null)}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            This will delete the group. Racers in the group will be kept, but will become unassigned.
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setGroupDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                const g = groupDeleteConfirm
                if (!g) return
                setGroupDeleteConfirm(null)
                if (selectedGroupId === g.id) setSelectedGroupId(null)
                try {
                  await deleteGroupM.mutateAsync(g.id)
                } catch {
                  // errors are toasted by the mutation
                }
              }}
              disabled={deleteGroupM.isPending}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={bulkGroupDeleteConfirmOpen}
        title={`Delete ${selectedGroupIds.size} group(s)`}
        onClose={() => setBulkGroupDeleteConfirmOpen(false)}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            The following group(s) will be deleted. Racers assigned to them will be kept and will appear under{' '}
            <span className="font-semibold">All</span>.
          </p>
          <ul className="max-h-48 overflow-auto rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
            {groups
              .filter((g) => selectedGroupIds.has(g.id))
              .map((g) => (
                <li key={g.id} className="truncate">
                  • {g.name}
                </li>
              ))}
          </ul>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setBulkGroupDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                setBulkGroupDeleteConfirmOpen(false)
                await deleteSelectedGroups()
              }}
              disabled={deleteGroupM.isPending}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={racerDeleteConfirm != null}
        title={racerDeleteConfirm ? `Delete racer: ${racerDeleteConfirm.name}` : 'Delete racer'}
        onClose={() => setRacerDeleteConfirm(null)}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-700 dark:text-slate-200">This cannot be undone.</p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setRacerDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                const r = racerDeleteConfirm
                if (!r) return
                setRacerDeleteConfirm(null)
                try {
                  await deleteRacerM.mutateAsync(r.id)
                } catch {
                  // errors are toasted by the mutation
                }
              }}
              disabled={deleteRacerM.isPending}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={bulkDeleteConfirmOpen} title={`Delete ${selectedIds.size} racer(s)`} onClose={() => setBulkDeleteConfirmOpen(false)}>
        <div className="space-y-3">
          <p className="text-sm text-slate-700 dark:text-slate-200">This cannot be undone.</p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setBulkDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                setBulkDeleteConfirmOpen(false)
                await deleteSelectedRacers()
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={csvModalOpen} title="Import racers from CSV" onClose={() => setCsvModalOpen(false)}>
        <div className="space-y-3">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Upload a CSV and map its columns. The import will create groups referenced in the CSV if they don’t exist.
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              e.currentTarget.setAttribute('data-drag', 'true')
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              e.currentTarget.removeAttribute('data-drag')
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              e.currentTarget.removeAttribute('data-drag')
              const f = e.dataTransfer.files?.[0]
              if (f) parseCsv(f)
            }}
            className="group flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-slate-300 px-4 py-6 text-center transition-colors data-[drag]:border-blue-500 data-[drag]:bg-blue-50 dark:border-slate-700 dark:data-[drag]:border-blue-400 dark:data-[drag]:bg-blue-950/30"
          >
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Drag &amp; drop a CSV file here, or
            </p>
            <Button
              size="sm"
              onClick={async () => {
                // Use pywebview native file dialog if available
                const pywebview = (window as any).pywebview
                if (pywebview?.api?.pick_file) {
                  try {
                    const result = await pywebview.api.pick_file(
                      'Choose a CSV file',
                      'CSV files (*.csv)',
                    )
                    if (result?.contents) {
                      const file = new File([result.contents], result.name ?? 'import.csv', {
                        type: 'text/csv',
                      })
                      parseCsv(file)
                    }
                  } catch {
                    // Fallback: click hidden input
                    csvFileRef.current?.click()
                  }
                } else {
                  csvFileRef.current?.click()
                }
              }}
            >
              Choose CSV File…
            </Button>
            {csvFields.length ? (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                ✓ {csvRows.length} rows loaded
              </span>
            ) : null}
          </div>
          <input
            ref={csvFileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              parseCsv(f)
            }}
          />

          {csvParseError ? <div className="text-sm text-red-600">{csvParseError}</div> : null}

          {csvFields.length ? (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Name (required)</label>
                <select
                  value={csvMapping.nameKey}
                  onChange={(e) => setCsvMapping((m) => ({ ...m, nameKey: e.target.value }))}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950"
                >
                  <option value="">(choose)</option>
                  {csvFields.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Group</label>
                <select
                  value={csvMapping.groupKey ?? ''}
                  onChange={(e) =>
                    setCsvMapping((m) => ({ ...m, groupKey: e.target.value ? e.target.value : null }))
                  }
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950"
                >
                  <option value="">(none)</option>
                  {csvFields.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Car name</label>
                <select
                  value={csvMapping.carNameKey ?? ''}
                  onChange={(e) =>
                    setCsvMapping((m) => ({ ...m, carNameKey: e.target.value ? e.target.value : null }))
                  }
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950"
                >
                  <option value="">(none)</option>
                  {csvFields.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Car number</label>
                <select
                  value={csvMapping.carNumberKey ?? ''}
                  onChange={(e) =>
                    setCsvMapping((m) => ({ ...m, carNumberKey: e.target.value ? e.target.value : null }))
                  }
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950"
                >
                  <option value="">(none)</option>
                  {csvFields.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          {csvPreview.length ? (
            <div>
              <div className="text-sm font-semibold">Preview</div>
              <div className="mt-2 max-h-56 overflow-auto rounded-md border border-slate-200 dark:border-slate-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-900">
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Car</th>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Group</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.map((r, idx) => (
                      <tr key={idx} className="border-b border-slate-200 dark:border-slate-800">
                        <td className="px-3 py-2">{r.name || '—'}</td>
                        <td className="px-3 py-2">{r.car_name || '—'}</td>
                        <td className="px-3 py-2">{r.car_number || '—'}</td>
                        <td className="px-3 py-2">{r.group || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                {csvRows.length} row(s) loaded.
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setCsvModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void importCsvNow()} disabled={csvImporting}>
              {csvImporting ? 'Importing…' : 'Import'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
