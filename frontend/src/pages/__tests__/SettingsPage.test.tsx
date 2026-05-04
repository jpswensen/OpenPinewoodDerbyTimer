import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderWithProviders } from '../../test/test-utils'
import { SettingsPage } from '../../pages/SettingsPage'
import { server } from '../../test/mocks/server'
import { STORAGE_KEYS } from '../../lib/settings'

// Mock WebSocket for the settings page
class MockWebSocket {
  static instances: MockWebSocket[] = []
  url: string
  readyState = 0
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((evt: { data: string }) => void) | null = null

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    setTimeout(() => {
      this.readyState = 1
      this.onopen?.()
    }, 0)
  }

  send() {}
  close() {
    this.readyState = 3
    this.onclose?.()
  }

  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
}

beforeEach(() => {
  MockWebSocket.instances = []
  vi.stubGlobal('WebSocket', MockWebSocket)
})

describe('SettingsPage', () => {
  it('renders the Settings heading', async () => {
    renderWithProviders(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument()
    })
  })

  it('renders connection section with Serial button', async () => {
    renderWithProviders(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Serial' })).toBeInTheDocument()
    })
  })

  it('does not render Network connection button when WiFi feature is disabled', async () => {
    renderWithProviders(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Serial' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Network' })).toBeNull()
  })

  it('renders lane count configuration', async () => {
    renderWithProviders(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Lane count')).toBeInTheDocument()
    })
  })

  it('renders appearance section', async () => {
    renderWithProviders(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Appearance & sound')).toBeInTheDocument()
    })
  })

  it('shows connection status badge', async () => {
    renderWithProviders(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Disconnected')).toBeInTheDocument()
    })
  })

  it('sends the configured lane count with connect requests', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post('/api/connection/connect', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({
          connection_state: 'connected',
          mode: 'serial',
          target: '/dev/ttyUSB0',
          last_message_at: null,
          last_error: null,
          last_status: null,
        })
      }),
    )

    localStorage.setItem(STORAGE_KEYS.serialPort, '/dev/ttyUSB0')
    localStorage.setItem(STORAGE_KEYS.laneCount, '4')
    renderWithProviders(<SettingsPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Connect' }))

    await waitFor(() => {
      expect(bodies).toHaveLength(1)
    })
    expect(bodies[0]).toMatchObject({ mode: 'serial', serial_port: '/dev/ttyUSB0', num_lanes: 4 })
  })
})
