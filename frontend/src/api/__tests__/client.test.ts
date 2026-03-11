import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/mocks/server'
import { apiFetch, ApiError } from '../../api/client'

describe('apiFetch', () => {
  it('fetches JSON data', async () => {
    server.use(
      http.get('/api/test', () => HttpResponse.json({ ok: true })),
    )
    const data = await apiFetch<{ ok: boolean }>('/test')
    expect(data).toEqual({ ok: true })
  })

  it('sends POST with JSON body', async () => {
    server.use(
      http.post('/api/items', async ({ request }) => {
        const body = await request.json()
        return HttpResponse.json(body, { status: 201 })
      }),
    )
    const data = await apiFetch<{ name: string }>('/items', {
      method: 'POST',
      body: { name: 'test' },
    })
    expect(data).toEqual({ name: 'test' })
  })

  it('appends query parameters', async () => {
    server.use(
      http.get('/api/search', ({ request }) => {
        const url = new URL(request.url)
        return HttpResponse.json({ q: url.searchParams.get('q') })
      }),
    )
    const data = await apiFetch<{ q: string }>('/search', { query: { q: 'hello' } })
    expect(data).toEqual({ q: 'hello' })
  })

  it('skips null/undefined query values', async () => {
    server.use(
      http.get('/api/filter', ({ request }) => {
        const url = new URL(request.url)
        return HttpResponse.json({
          hasNull: url.searchParams.has('empty'),
          name: url.searchParams.get('name'),
        })
      }),
    )
    const data = await apiFetch<{ hasNull: boolean; name: string }>('/filter', {
      query: { empty: null, name: 'yes' },
    })
    expect(data.hasNull).toBe(false)
    expect(data.name).toBe('yes')
  })

  it('throws ApiError on 4xx responses', async () => {
    server.use(
      http.get('/api/fail', () =>
        HttpResponse.json({ detail: 'Not found' }, { status: 404 }),
      ),
    )
    try {
      await apiFetch('/fail')
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      const apiErr = err as ApiError
      expect(apiErr.status).toBe(404)
      expect(apiErr.message).toBe('Not found')
    }
  })

  it('throws ApiError on 5xx responses', async () => {
    server.use(
      http.get('/api/error', () =>
        new HttpResponse('Internal error', { status: 500 }),
      ),
    )
    try {
      await apiFetch('/error')
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(500)
    }
  })

  it('sends FormData without Content-Type header', async () => {
    server.use(
      http.post('/api/upload', async ({ request }) => {
        // MSW handles multipart
        const contentType = request.headers.get('content-type') || ''
        return HttpResponse.json({ isMultipart: contentType.includes('multipart') })
      }),
    )
    const fd = new FormData()
    fd.append('file', new Blob(['test']), 'test.csv')
    const data = await apiFetch<{ isMultipart: boolean }>('/upload', {
      method: 'POST',
      body: fd,
    })
    expect(data.isMultipart).toBe(true)
  })
})
