import { apiFetch } from '../client'

export type ConnectionStatus = {
  connected: boolean
  mode: 'serial' | 'tcp' | null
  last_message_at: number | null
  last_error: string | null
}

export type SerialPort = { device: string; description: string | null }

export function getConnectionStatus(): Promise<ConnectionStatus> {
  return apiFetch('/connection/status')
}

export function listSerialPorts(): Promise<SerialPort[]> {
  return apiFetch('/connection/serial-ports')
}
