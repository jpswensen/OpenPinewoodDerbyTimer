import { apiFetch } from '../client'

export type TimerStatus = {
  state: number
  state_name: string
  start_time_us: number | null
  current_time_us: number | null
  num_lanes: number | null
  lane_end_times_us: Array<number | null>
}

export type ConnectionStatus = {
  connection_state: 'disconnected' | 'connecting' | 'connected'
  mode: 'serial' | 'tcp' | null
  target: string | null
  last_message_at: string | null
  last_error: string | null
  last_status: TimerStatus | null
}

export type SerialPort = { device: string; description: string | null; hwid: string | null }

export function getConnectionStatus(): Promise<ConnectionStatus> {
  return apiFetch('/connection/status')
}

export function listSerialPorts(): Promise<SerialPort[]> {
  return apiFetch('/connection/serial-ports')
}

export function armTimer(): Promise<ConnectionStatus> {
  return apiFetch('/connection/arm', { method: 'POST' })
}

export function resetTimer(): Promise<ConnectionStatus> {
  return apiFetch('/connection/reset', { method: 'POST' })
}

export function setTimerLanes(numLanes: number): Promise<ConnectionStatus> {
  return apiFetch('/connection/set-lanes', { method: 'POST', body: { num_lanes: numLanes } })
}
