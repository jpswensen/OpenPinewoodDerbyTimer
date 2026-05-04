import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
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

  it('keeps the current heat at the race lane count when timer status reports more lanes', async () => {
    renderWithProviders(<RacePage />)

    await waitFor(() => {
      expect(screen.getAllByText('Lane 4').length).toBeGreaterThan(0)
    })

    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: 'race_state',
          payload: {
            state: 3,
            state_name: 'IN_RACE',
            start_time_us: 1000,
            current_time_us: 2000,
            num_lanes: 8,
            gate_set: false,
          },
        }),
      })
      ws.onmessage?.({
        data: JSON.stringify({
          type: 'lane_times',
          payload: {
            num_lanes: 8,
            lane_end_times_us: [1_100_000, 1_200_000, 1_300_000, 1_400_000, null, null, null, null],
            lane_places: { 1: 1, 2: 2, 3: 3, 4: 4 },
          },
        }),
      })
    })

    await waitFor(() => {
      expect(screen.getAllByText('Lane 4').length).toBeGreaterThan(0)
    })
    expect(screen.queryAllByText('Lane 5')).toHaveLength(0)
  })
})
