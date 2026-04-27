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

export type MdnsService = {
  name: string
  host: string
  port: number
  addresses: string[]
}

export type MdnsDiscoveryResponse = {
  services: MdnsService[]
  pwdtimer_local_addresses: string[]
}

export function discoverMdns(timeoutSeconds = 1.5): Promise<MdnsDiscoveryResponse> {
  return apiFetch('/connection/discover-mdns', { query: { timeout_seconds: timeoutSeconds } })
}

export type ConnectRequest =
  | {
      mode: 'serial'
      serial_port: string
      baudrate?: number
      auto_reconnect?: boolean
    }
  | {
      mode: 'tcp'
      host: string
      port?: number
      auto_reconnect?: boolean
    }

export function connectTimer(payload: ConnectRequest): Promise<ConnectionStatus> {
  return apiFetch('/connection/connect', { method: 'POST', body: payload })
}

export function disconnectTimer(): Promise<ConnectionStatus> {
  return apiFetch('/connection/disconnect', { method: 'POST' })
}

export function toggleSerialMonitor(): Promise<{ enabled: boolean }> {
  return apiFetch('/connection/serial-monitor', { method: 'POST' })
}

export function getSerialMonitorStatus(): Promise<{ enabled: boolean }> {
  return apiFetch('/connection/serial-monitor')
}

export function resetAllData(): Promise<{ status: string }> {
  return apiFetch('/reset-all-data', { method: 'POST' })
}
