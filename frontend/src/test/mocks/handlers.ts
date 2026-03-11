import { http, HttpResponse } from 'msw'

// -------- Mock data --------

export const mockGroups = [
  { id: 1, name: 'Tiger Cubs', description: 'Ages 6-7' },
  { id: 2, name: 'Wolf', description: 'Ages 7-8' },
]

export const mockRacers = [
  { id: 1, name: 'Alice', car_name: 'Speed Demon', car_number: '01', group_id: 1 },
  { id: 2, name: 'Bob', car_name: 'Thunder', car_number: '02', group_id: 1 },
  { id: 3, name: 'Charlie', car_name: 'Lightning', car_number: '03', group_id: 2 },
  { id: 4, name: 'Diana', car_name: 'Flash', car_number: '04', group_id: 2 },
]

export const mockRaces = [
  { id: 1, name: 'Spring Derby', num_lanes: 4, status: 'setup' as const, created_at: '2026-03-11T12:00:00' },
]

export const mockHeats: Array<{
  id: number
  race_id: number
  heat_number: number
  status: 'pending' | 'in_progress' | 'completed'
  lanes: Array<{
    id: number
    lane_number: number
    racer_id: number | null
    time_microseconds: number | null
    place: number | null
  }>
}> = [
  {
    id: 1,
    race_id: 1,
    heat_number: 1,
    status: 'pending',
    lanes: [
      { id: 1, lane_number: 1, racer_id: 1, time_microseconds: null, place: null },
      { id: 2, lane_number: 2, racer_id: 2, time_microseconds: null, place: null },
      { id: 3, lane_number: 3, racer_id: 3, time_microseconds: null, place: null },
      { id: 4, lane_number: 4, racer_id: 4, time_microseconds: null, place: null },
    ],
  },
  {
    id: 2,
    race_id: 1,
    heat_number: 2,
    status: 'completed',
    lanes: [
      { id: 5, lane_number: 1, racer_id: 4, time_microseconds: 3_200_000, place: 1 },
      { id: 6, lane_number: 2, racer_id: 3, time_microseconds: 3_350_000, place: 2 },
      { id: 7, lane_number: 3, racer_id: 2, time_microseconds: 3_500_000, place: 3 },
      { id: 8, lane_number: 4, racer_id: 1, time_microseconds: 3_650_000, place: 4 },
    ],
  },
]

export const mockRaceResults = [
  { id: 1, race_id: 1, racer_id: 4, average_time: 3_200_000, best_time: 3_200_000, total_points: 1, overall_place: 1 },
  { id: 2, race_id: 1, racer_id: 3, average_time: 3_350_000, best_time: 3_350_000, total_points: 2, overall_place: 2 },
  { id: 3, race_id: 1, racer_id: 2, average_time: 3_500_000, best_time: 3_500_000, total_points: 3, overall_place: 3 },
  { id: 4, race_id: 1, racer_id: 1, average_time: 3_650_000, best_time: 3_650_000, total_points: 4, overall_place: 4 },
]

export const mockConnectionStatus = {
  connection_state: 'disconnected' as const,
  mode: null,
  target: null,
  last_message_at: null,
  last_error: null,
  last_status: null,
}

export const mockSerialPorts = [
  { device: '/dev/ttyUSB0', description: 'CP2102', hwid: 'USB VID:PID=10C4:EA60' },
]

// -------- Handlers --------

export const handlers = [
  // Groups
  http.get('/api/groups', () => HttpResponse.json(mockGroups)),
  http.post('/api/groups', async ({ request }) => {
    const body = await request.json() as { name: string; description?: string }
    return HttpResponse.json({ id: 3, name: body.name, description: body.description ?? null }, { status: 201 })
  }),
  http.put('/api/groups/:id', async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>
    const existing = mockGroups.find((g) => g.id === Number(params.id))
    return HttpResponse.json({ ...existing, ...body })
  }),
  http.delete('/api/groups/:id', () => new HttpResponse(null, { status: 204 })),

  // Racers
  http.get('/api/racers', ({ request }) => {
    const url = new URL(request.url)
    const groupId = url.searchParams.get('group_id')
    const filtered = groupId ? mockRacers.filter((r) => r.group_id === Number(groupId)) : mockRacers
    return HttpResponse.json(filtered)
  }),
  http.post('/api/racers', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({ id: 5, ...body }, { status: 201 })
  }),
  http.post('/api/racers/bulk', async ({ request }) => {
    const body = await request.json() as Array<Record<string, unknown>>
    return HttpResponse.json(body.map((r, i) => ({ id: 10 + i, ...r })), { status: 201 })
  }),
  http.put('/api/racers/:id', async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>
    const existing = mockRacers.find((r) => r.id === Number(params.id))
    return HttpResponse.json({ ...existing, ...body })
  }),
  http.delete('/api/racers/:id', () => new HttpResponse(null, { status: 204 })),

  // CSV Import/Export
  http.post('/api/import/csv', () =>
    HttpResponse.json({ groups_created: 1, racers_created: 3, errors: [] }),
  ),
  http.get('/api/export/csv', () =>
    new HttpResponse('name,car_name,car_number,group\nAlice,Speed Demon,01,Tiger Cubs\n', {
      headers: { 'Content-Type': 'text/csv' },
    }),
  ),

  // Races
  http.get('/api/races', () => HttpResponse.json(mockRaces)),
  http.post('/api/races', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({ id: 2, status: 'setup', created_at: '2026-03-11T12:00:00', ...body }, { status: 201 })
  }),
  http.put('/api/races/:id', async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>
    const existing = mockRaces.find((r) => r.id === Number(params.id))
    return HttpResponse.json({ ...existing, ...body })
  }),
  http.delete('/api/races/:id', () => new HttpResponse(null, { status: 204 })),

  // Heats
  http.post('/api/races/:raceId/generate-heats', () => HttpResponse.json(mockHeats)),
  http.get('/api/races/:raceId/heats', () => HttpResponse.json(mockHeats)),
  http.put('/api/heats/:id', async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>
    const existing = mockHeats.find((h) => h.id === Number(params.id))
    return HttpResponse.json({ ...existing, ...body })
  }),
  http.post('/api/heats/:id/repeat', ({ params }) => {
    const existing = mockHeats.find((h) => h.id === Number(params.id))
    return HttpResponse.json({ ...existing, status: 'pending' })
  }),
  http.put('/api/races/:raceId/heats/reorder', () => HttpResponse.json(mockHeats)),

  // Race Results
  http.get('/api/races/:raceId/results', () => HttpResponse.json(mockRaceResults)),

  // Connection
  http.get('/api/connection/status', () => HttpResponse.json(mockConnectionStatus)),
  http.get('/api/connection/serial-ports', () => HttpResponse.json(mockSerialPorts)),
  http.post('/api/connection/connect', () =>
    HttpResponse.json({ ...mockConnectionStatus, connection_state: 'connected', mode: 'serial', target: '/dev/ttyUSB0' }),
  ),
  http.post('/api/connection/disconnect', () => HttpResponse.json(mockConnectionStatus)),
  http.post('/api/connection/arm', () =>
    HttpResponse.json({ ...mockConnectionStatus, connection_state: 'connected' }),
  ),
  http.post('/api/connection/reset', () =>
    HttpResponse.json({ ...mockConnectionStatus, connection_state: 'connected' }),
  ),
  http.post('/api/connection/set-lanes', () =>
    HttpResponse.json({ ...mockConnectionStatus, connection_state: 'connected' }),
  ),
  http.get('/api/connection/discover-mdns', () =>
    HttpResponse.json({ services: [], pwdtimer_local_addresses: ['192.168.4.1'] }),
  ),

  // Certificates
  http.get('/api/certificates/preview', () =>
    new HttpResponse(new Blob(['%PDF-fake'], { type: 'application/pdf' }), {
      headers: { 'Content-Type': 'application/pdf' },
    }),
  ),
  http.post('/api/certificates/generate', () =>
    new HttpResponse(new Blob(['%PDF-fake'], { type: 'application/pdf' }), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="certificates.pdf"',
      },
    }),
  ),

  // PDF export
  http.get('/api/races/:raceId/export/pdf', () =>
    new HttpResponse(new Blob(['%PDF-fake'], { type: 'application/pdf' }), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="results.pdf"',
      },
    }),
  ),
]
