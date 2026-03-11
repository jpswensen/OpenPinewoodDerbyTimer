import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/test-utils'
import { SettingsPage } from '../../pages/SettingsPage'

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
      expect(screen.getByText('Serial')).toBeInTheDocument()
    })
  })

  it('renders Network connection button', async () => {
    renderWithProviders(<SettingsPage />)

    await waitFor(() => {
      const networkBtns = screen.getAllByText('Network')
      expect(networkBtns.length).toBeGreaterThan(0)
    })
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
})
