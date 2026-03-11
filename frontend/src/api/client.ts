export class ApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

type QueryValue = string | number | boolean | null | undefined

type ApiRequestInit = Omit<RequestInit, 'body'> & {
  body?: unknown
  query?: Record<string, QueryValue>
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
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

export async function apiFetch<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const url = buildUrl(path, init.query)

  const headers = new Headers(init.headers)
  const isFormData = init.body instanceof FormData
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  if (!isFormData && init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let requestBody: BodyInit | undefined
  if (init.body == null) {
    requestBody = undefined
  } else if (init.body instanceof FormData) {
    requestBody = init.body
  } else if (typeof init.body === 'string') {
    requestBody = init.body
  } else {
    requestBody = JSON.stringify(init.body)
  }

  const res = await fetch(url, {
    ...init,
    headers,
    body: requestBody,
  })

  const contentType = res.headers.get('content-type') || ''
  const body = contentType.includes('application/json') ? await res.json().catch(() => null) : await res.text()

  if (!res.ok) {
    let msg: string
    if (typeof body === 'string') {
      msg = body
    } else if (typeof body === 'object' && body && 'detail' in body) {
      const detail = (body as { detail?: unknown }).detail
      msg = typeof detail === 'string' ? detail : res.statusText
    } else {
      msg = res.statusText
    }
    throw new ApiError(msg, res.status, body)
  }

  return body as T
}
