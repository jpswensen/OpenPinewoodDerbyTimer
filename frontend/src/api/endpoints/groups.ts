import { apiFetch } from '../client'

export type Group = {
  id: number
  name: string
  description: string | null
}

export type GroupCreate = { name: string; description?: string | null }
export type GroupUpdate = { name?: string; description?: string | null }

export function listGroups(): Promise<Group[]> {
  return apiFetch('/groups')
}

export function createGroup(payload: GroupCreate): Promise<Group> {
  return apiFetch('/groups', { method: 'POST', body: payload })
}

export function updateGroup(id: number, payload: GroupUpdate): Promise<Group> {
  return apiFetch(`/groups/${id}`, { method: 'PUT', body: payload })
}

export function deleteGroup(id: number): Promise<void> {
  return apiFetch(`/groups/${id}`, { method: 'DELETE' })
}
