import { apiFetch } from '../client'

export type Race = {
  id: number
  name: string
  num_lanes: number
  status: 'setup' | 'in_progress' | 'completed'
  created_at: string
}

export type HeatLane = {
  id: number
  lane_number: number
  racer_id: number | null
  time_microseconds: number | null
  place: number | null
  dnf: boolean
}

export type Heat = {
  id: number
  race_id: number
  heat_number: number
  status: 'pending' | 'in_progress' | 'completed'
  lanes: HeatLane[]
}

export type RaceCreate = { name: string; num_lanes: number; status?: Race['status'] }
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
  return apiFetch(`/races/${raceId}/generate-heats`, {
    method: 'POST',
    query: { group_id: payload?.group_id ?? undefined },
  })
}

export function listHeats(raceId: number): Promise<Heat[]> {
  return apiFetch(`/races/${raceId}/heats`)
}

export type HeatLaneUpdate = {
  lane_number: number
  time_microseconds?: number | null
  racer_id?: number | null
  dnf?: boolean
}

export type HeatUpdateRequest = {
  status?: Heat['status']
  lanes?: HeatLaneUpdate[]
}

export function updateHeat(heatId: number, payload: HeatUpdateRequest): Promise<Heat> {
  return apiFetch(`/heats/${heatId}`, { method: 'PUT', body: payload })
}

export function repeatHeat(heatId: number): Promise<Heat> {
  return apiFetch(`/heats/${heatId}/repeat`, { method: 'POST' })
}

export function deleteHeat(heatId: number): Promise<void> {
  return apiFetch(`/heats/${heatId}`, { method: 'DELETE' })
}

export function reorderHeats(raceId: number, heatIds: number[]): Promise<Heat[]> {
  return apiFetch(`/races/${raceId}/heats/reorder`, { method: 'PUT', body: { heat_ids: heatIds } })
}

export type RaceResult = {
  id: number
  race_id: number
  racer_id: number
  average_time: number | null
  best_time: number | null
  total_points: number | null
  overall_place: number | null
  dnf_count: number
}

export function getRaceResults(raceId: number): Promise<RaceResult[]> {
  return apiFetch(`/races/${raceId}/results`)
}
