import { apiFetch } from '../client'

export type Race = {
  id: number
  name: string
  num_lanes: number
  status: 'setup' | 'in_progress' | 'completed'
}

export type HeatLane = {
  id: number
  lane_number: number
  racer_id: number | null
  time_microseconds: number | null
  place: number | null
}

export type Heat = {
  id: number
  race_id: number
  heat_number: number
  status: 'pending' | 'in_progress' | 'completed'
  lanes: HeatLane[]
}

export type RaceCreate = { name: string; num_lanes: number }
export type RaceUpdate = Partial<RaceCreate> & { status?: Race['status'] }

export function listRaces(): Promise<Race[]> {
  return apiFetch('/races')
}

export function createRace(payload: RaceCreate): Promise<Race> {
  return apiFetch('/races', { method: 'POST', body: payload })
}

export function updateRace(id: number, payload: RaceUpdate): Promise<Race> {
  return apiFetch(`/races/${id}`, { method: 'PUT', body: payload })
}

export function deleteRace(id: number): Promise<void> {
  return apiFetch(`/races/${id}`, { method: 'DELETE' })
}

export function generateHeats(raceId: number, payload?: { group_id?: number | null }): Promise<Heat[]> {
  return apiFetch(`/races/${raceId}/generate-heats`, { method: 'POST', body: payload || {} })
}

export function listHeats(raceId: number): Promise<Heat[]> {
  return apiFetch(`/races/${raceId}/heats`)
}
