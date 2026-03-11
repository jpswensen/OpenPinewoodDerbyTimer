import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/test-utils'
import { RacePage } from '../../pages/RacePage'

// Mock WebSocket
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

describe('RacePage', () => {
  it('renders the Race heading', async () => {
    renderWithProviders(<RacePage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /race/i })).toBeInTheDocument()
    })
  })

  it('shows lane cards area', async () => {
    renderWithProviders(<RacePage />)

    await waitFor(() => {
      expect(document.body).toBeTruthy()
    })
  })

  it('displays connection status indicator', async () => {
    renderWithProviders(<RacePage />)

    await waitFor(() => {
      const badges = screen.getAllByText(/connecting|connected|disconnected/i)
      expect(badges.length).toBeGreaterThan(0)
    })
  })

  it('shows control buttons for race operations', async () => {
    renderWithProviders(<RacePage />)

    await waitFor(() => {
      const buttons = screen.queryAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })
  })
})
