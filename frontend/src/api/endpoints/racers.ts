import { apiFetch } from '../client'

export type Racer = {
  id: number
  name: string
  car_name: string | null
  car_number: string | null
  group_id: number | null
}

export type RacerCreate = {
  name: string
  car_name?: string | null
  car_number?: string | null
  group_id?: number | null
}

export type RacerUpdate = Partial<RacerCreate>

export function listRacers(params?: { group_id?: number | null }): Promise<Racer[]> {
  return apiFetch('/racers', { query: { group_id: params?.group_id } })
}

export function createRacer(payload: RacerCreate): Promise<Racer> {
  return apiFetch('/racers', { method: 'POST', body: payload })
}

export function bulkCreateRacers(payload: RacerCreate[]): Promise<Racer[]> {
  return apiFetch('/racers/bulk', { method: 'POST', body: payload })
}

export function updateRacer(id: number, payload: RacerUpdate): Promise<Racer> {
  return apiFetch(`/racers/${id}`, { method: 'PUT', body: payload })
}

export function deleteRacer(id: number): Promise<void> {
  return apiFetch(`/racers/${id}`, { method: 'DELETE' })
}
