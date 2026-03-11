import { ApiError } from '../client'

export type PageSizeName = 'letter' | 'a4'
export type PageOrientation = 'portrait' | 'landscape'

export type CertificatesGenerateRequest = {
  race_id: number
  mode: 'winners' | 'participants'

  // Winners options
  places?: number[]
  include_overall?: boolean
  include_per_group?: boolean

  // Recipient filters
  group_id?: number | null
  racer_ids?: number[] | null

  // Presentation
  event_name?: string | null
  event_date?: string | null // YYYY-MM-DD
  issued_by?: string
  custom_message?: string | null

  // PDF output
  page_size?: PageSizeName
  orientation?: PageOrientation
}

function buildApiUrl(path: string): string {
  const base = import.meta.env.VITE_API_BASE_URL || '/api'
  return new URL(`${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`, window.location.origin).toString()
}

function parseFilenameFromContentDisposition(headerValue: string | null): string | null {
  if (!headerValue) return null
  const m = /filename\*=UTF-8''([^;]+)|filename="?([^;"]+)"?/i.exec(headerValue)
  const raw = (m?.[1] ?? m?.[2])?.trim()
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

async function fetchPdf(path: string, init: RequestInit): Promise<{ blob: Blob; filename: string | null }> {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Accept: 'application/pdf',
      ...(init.headers || {}),
    },
  })

  if (!res.ok) {
    const contentType = res.headers.get('content-type') || ''
    const body = contentType.includes('application/json') ? await res.json().catch(() => null) : await res.text()

    let msg = res.statusText
    if (typeof body === 'string' && body.trim()) msg = body
    else if (body && typeof body === 'object' && 'detail' in body) {
      const d = (body as { detail?: unknown }).detail
      if (typeof d === 'string') msg = d
    }

    throw new ApiError(msg, res.status, body)
  }

  const blob = await res.blob()
  const filename = parseFilenameFromContentDisposition(res.headers.get('content-disposition'))
  return { blob, filename }
}

export async function previewSampleCertificate(params: { type: 'winner' | 'participation'; place?: number }): Promise<Blob> {
  const url = new URL(buildApiUrl('/certificates/preview'))
  url.searchParams.set('type', params.type)
  if (params.place != null) url.searchParams.set('place', String(params.place))

  const res = await fetch(url.toString(), { headers: { Accept: 'application/pdf' } })
  if (!res.ok) throw new ApiError(await res.text(), res.status, null)
  return res.blob()
}

export async function generateCertificatesPdf(payload: CertificatesGenerateRequest): Promise<{ blob: Blob; filename: string | null }> {
  return fetchPdf('/certificates/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
