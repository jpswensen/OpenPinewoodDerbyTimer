import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { useToast } from '../components/ui/Toast'

import { ApiError } from '../api/client'
import { listGroups } from '../api/endpoints/groups'
import { listHeats, listRaces } from '../api/endpoints/races'
import { listRacers } from '../api/endpoints/racers'
import type { Group } from '../api/endpoints/groups'
import type { Heat, Race } from '../api/endpoints/races'
import type { Racer } from '../api/endpoints/racers'
import type { CertificatesGenerateRequest, PageOrientation, PageSizeName } from '../api/endpoints/certificates'
import { generateCertificatesPdf, previewSampleCertificate } from '../api/endpoints/certificates'
import { cn } from '../lib/cn'

type CertificateKind = 'winner' | 'participation' | 'custom'

type RecipientMode = 'all' | 'group' | 'individual'

function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
}

function openBlob(blob: Blob) {
  const href = URL.createObjectURL(blob)
  window.open(href, '_blank', 'noopener,noreferrer')
  // Do not revoke immediately; the other tab needs it. Browser will eventually GC.
}

function distinctRacerIdsFromHeats(heats: Heat[]): number[] {
  const ids = new Set<number>()
  for (const h of heats) {
    for (const ln of h.lanes) {
      if (ln.racer_id != null) ids.add(ln.racer_id)
    }
  }
  return [...ids].sort((a, b) => a - b)
}

export function CertificatesPage() {
  const { toast } = useToast()

  const [selectedRaceId, setSelectedRaceId] = useState<number | null>(null)
  const [kind, setKind] = useState<CertificateKind>('winner')
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('all')
  const [groupId, setGroupId] = useState<number | null>(null)
  const [racerId, setRacerId] = useState<number | null>(null)

  const [includeOverall, setIncludeOverall] = useState(true)
  const [includePerGroup, setIncludePerGroup] = useState(true)
  const [places, setPlaces] = useState<Set<number>>(() => new Set([1, 2, 3]))

  const [eventName, setEventName] = useState<string>('')
  const [eventDate, setEventDate] = useState<string>('')
  const [issuedBy, setIssuedBy] = useState<string>('PWDTimer')
  const [customMessage, setCustomMessage] = useState<string>('')

  const [pageSize, setPageSize] = useState<PageSizeName>('letter')
  const [orientation, setOrientation] = useState<PageOrientation>('landscape')

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

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

  const participantIds = useMemo(() => {
    const heats = heatsQ.data ?? []
    return distinctRacerIdsFromHeats(heats)
  }, [heatsQ.data])

  const filteredRacers = useMemo(() => {
    const racers = racersQ.data ?? []
    const allowed = new Set(participantIds)

    let list = racers.filter((r) => allowed.has(r.id))

    if (groupId != null) list = list.filter((r) => r.group_id === groupId)

    return list.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id)
  }, [groupId, participantIds, racersQ.data])

  useEffect(() => {
    // Clear racer selection if it no longer applies.
    if (racerId == null) return
    const r = racersById.get(racerId)
    if (!r) setRacerId(null)
    else if (groupId != null && r.group_id !== groupId) setRacerId(null)
  }, [groupId, racerId, racersById])

  useEffect(() => {
    // Maintain a single active object URL for the preview.
    if (previewUrlRef.current && previewUrlRef.current !== previewUrl) {
      URL.revokeObjectURL(previewUrlRef.current)
    }
    previewUrlRef.current = previewUrl
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
  }, [previewUrl])

  function buildPayload(): CertificatesGenerateRequest | null {
    if (activeRaceId == null) return null

    const trimmedName = eventName.trim()
    const trimmedIssuedBy = issuedBy.trim() || 'PWDTimer'
    const trimmedMsg = customMessage.trim()

    const base: CertificatesGenerateRequest = {
      race_id: activeRaceId,
      mode: kind === 'winner' ? 'winners' : 'participants',
      group_id: recipientMode === 'group' ? groupId : null,
      racer_ids: recipientMode === 'individual' && racerId != null ? [racerId] : null,
      event_name: trimmedName || null,
      event_date: eventDate.trim() || null,
      issued_by: trimmedIssuedBy,
      custom_message: trimmedMsg || null,
      page_size: pageSize,
      orientation,
    }

    if (kind === 'winner') {
      base.places = [...places].sort((a, b) => a - b)
      base.include_overall = includeOverall
      base.include_per_group = includePerGroup
    }

    return base
  }

  async function doPreviewSample() {
    try {
      const pdf = await previewSampleCertificate({ type: kind === 'winner' ? 'winner' : 'participation', place: 1 })
      setPreviewUrl(URL.createObjectURL(pdf))
    } catch (e) {
      toast({ variant: 'error', title: 'Preview failed', description: e instanceof ApiError ? e.message : 'Failed to preview' })
    }
  }

  async function doPreviewCurrent() {
    const payload = buildPayload()
    if (!payload) return
    try {
      setIsGenerating(true)
      const { blob } = await generateCertificatesPdf(payload)
      setPreviewUrl(URL.createObjectURL(blob))
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to generate preview'
      toast({ variant: 'error', title: 'Preview failed', description: msg })
    } finally {
      setIsGenerating(false)
    }
  }

  async function doDownload() {
    const payload = buildPayload()
    if (!payload) return
    try {
      setIsGenerating(true)
      const { blob, filename } = await generateCertificatesPdf(payload)
      const dl = filename ?? `certificates-${payload.race_id}.pdf`
      downloadBlob(blob, dl)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to generate certificates'
      toast({ variant: 'error', title: 'Generate failed', description: msg })
    } finally {
      setIsGenerating(false)
    }
  }

  async function doOpenForPrint() {
    const payload = buildPayload()
    if (!payload) return
    try {
      setIsGenerating(true)
      const { blob } = await generateCertificatesPdf(payload)
      openBlob(blob)
      toast({ variant: 'info', title: 'Opened PDF', description: 'Use your browser print dialog to print certificates.' })
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to generate certificates'
      toast({ variant: 'error', title: 'Generate failed', description: msg })
    } finally {
      setIsGenerating(false)
    }
  }

  const estPages = useMemo(() => {
    if (activeRaceId == null) return 0
    if (kind === 'winner') return 0 // depends on results; computed server-side
    if (recipientMode === 'individual') return racerId != null ? 1 : 0
    if (recipientMode === 'group') return filteredRacers.length
    return participantIds.length
  }, [activeRaceId, filteredRacers.length, kind, participantIds.length, racerId, recipientMode])

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Certificates</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Generate winner and participation certificates as printable PDFs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={doPreviewSample} disabled={isGenerating}>
              Preview sample
            </Button>
            <Button variant="secondary" onClick={doPreviewCurrent} disabled={isGenerating || activeRaceId == null}>
              Preview selection
            </Button>
            <Button onClick={doDownload} disabled={isGenerating || activeRaceId == null}>
              {isGenerating ? 'Generating…' : 'Download PDF'}
            </Button>
            <Button variant="secondary" onClick={doOpenForPrint} disabled={isGenerating || activeRaceId == null}>
              Print…
            </Button>
          </div>
        </div>

        {isGenerating ? (
          <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            Generating…{estPages ? ` (~${estPages} page${estPages === 1 ? '' : 's'})` : ''}
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <div className="font-medium">Race</div>
              <select
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
                value={activeRaceId ?? ''}
                onChange={(e) => setSelectedRaceId(e.target.value ? Number(e.target.value) : null)}
              >
                {(racesQ.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              {selectedRace ? <div className="text-xs opacity-70">{selectedRace.num_lanes} lanes • {selectedRace.status}</div> : null}
            </label>

            <label className="space-y-1 text-sm">
              <div className="font-medium">Certificate type</div>
              <select
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
                value={kind}
                onChange={(e) => {
                  const v = e.target.value as CertificateKind
                  setKind(v)
                  setRecipientMode('all')
                }}
              >
                <option value="winner">Winner</option>
                <option value="participation">Participation</option>
                <option value="custom">Custom message (participation)</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <div className="font-medium">Recipients</div>
              <select
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
                value={recipientMode}
                onChange={(e) => setRecipientMode(e.target.value as RecipientMode)}
              >
                <option value="all">All</option>
                <option value="group">Group</option>
                <option value="individual">Individual</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <div className="font-medium">Group</div>
              <select
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
                value={groupId ?? ''}
                onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}
                disabled={recipientMode !== 'group'}
              >
                <option value="">All groups</option>
                {(groupsQ.data ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={cn('space-y-1 text-sm md:col-span-2', recipientMode !== 'individual' ? 'opacity-50' : null)}>
              <div className="font-medium">Racer (for individual preview/print)</div>
              <select
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
                value={racerId ?? ''}
                onChange={(e) => setRacerId(e.target.value ? Number(e.target.value) : null)}
                disabled={recipientMode !== 'individual'}
              >
                <option value="">Select racer…</option>
                {filteredRacers.map((r) => {
                  const g = r.group_id != null ? groupsById.get(r.group_id) ?? null : null
                  const label = g ? `${r.name} — ${g.name}` : r.name
                  return (
                    <option key={r.id} value={r.id}>
                      {label}
                    </option>
                  )
                })}
              </select>
              {recipientMode === 'individual' && racerId != null ? (
                <div className="text-xs opacity-70">Selected: {racersById.get(racerId)?.name ?? racerId}</div>
              ) : null}
            </label>
          </div>

          {kind === 'winner' ? (
            <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
              <div className="text-sm font-semibold">Winner options</div>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={includeOverall} onChange={(e) => setIncludeOverall(e.target.checked)} />
                  Overall
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={includePerGroup} onChange={(e) => setIncludePerGroup(e.target.checked)} />
                  Per-group
                </label>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Places</span>
                  {[1, 2, 3].map((p) => (
                    <label key={p} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={places.has(p)}
                        onChange={(e) => {
                          setPlaces((prev) => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(p)
                            else next.delete(p)
                            return next
                          })
                        }}
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                Note: winner certificates require completed heats/results for the selected race.
              </div>
            </div>
          ) : null}

          <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
            <div className="text-sm font-semibold">Customization</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <div className="font-medium">Event name</div>
                <input
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
                  placeholder={selectedRace?.name || 'Pinewood Derby'}
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                />
              </label>

              <label className="space-y-1 text-sm">
                <div className="font-medium">Event date</div>
                <input
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </label>

              <label className="space-y-1 text-sm md:col-span-2">
                <div className="font-medium">Issued by</div>
                <input
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
                  value={issuedBy}
                  onChange={(e) => setIssuedBy(e.target.value)}
                />
              </label>

              <label className="space-y-1 text-sm md:col-span-2">
                <div className="font-medium">Custom message</div>
                <textarea
                  className="min-h-20 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
                  placeholder={kind === 'custom' ? 'e.g., For outstanding sportsmanship and great teamwork.' : 'Optional'}
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
            <div className="text-sm font-semibold">PDF layout</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <div className="font-medium">Page size</div>
                <select
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value as PageSizeName)}
                >
                  <option value="letter">Letter</option>
                  <option value="a4">A4</option>
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <div className="font-medium">Orientation</div>
                <select
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as PageOrientation)}
                >
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                </select>
              </label>

              <label className="space-y-1 text-sm md:col-span-2">
                <div className="font-medium">Template</div>
                <select className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950" defaultValue="classic">
                  <option value="classic">Classic (default)</option>
                </select>
                <div className="text-xs opacity-70">Additional templates can be added later via backend generator changes.</div>
              </label>
            </div>
          </div>
        </Card>

        <Card className="min-h-[520px] p-0">
          <div className="border-b border-slate-200 p-4 dark:border-slate-800">
            <div className="text-sm font-semibold">Preview</div>
            <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Preview uses your current selection when possible; if the race has no results yet, use “Preview sample”.
            </div>
          </div>
          <div className="p-4">
            {previewUrl ? (
              <object data={previewUrl} type="application/pdf" className="h-[640px] w-full rounded-md border border-slate-200 dark:border-slate-800">
                <div className="text-sm text-slate-600 dark:text-slate-300">PDF preview unavailable in this browser.</div>
              </object>
            ) : (
              <div className="flex h-[640px] items-center justify-center text-sm text-slate-600 dark:text-slate-300">
                No preview loaded.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
