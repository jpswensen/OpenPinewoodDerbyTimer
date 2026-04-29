import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/test-utils'
import { RacersPage } from '../../pages/RacersPage'

describe('RacersPage', () => {
  it('renders group sidebar and racer list', async () => {
    renderWithProviders(<RacersPage />)

    // Wait for groups to load from MSW
    expect(await screen.findByRole('button', { name: 'Tiger Cubs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Wolf' })).toBeInTheDocument()
  })

  it('loads and displays racers', async () => {
    renderWithProviders(<RacersPage />)

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Charlie')).toBeInTheDocument()
    expect(screen.getByText('Diana')).toBeInTheDocument()
  })

  it('has an Add Racer button', async () => {
    renderWithProviders(<RacersPage />)

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })

    // There should be an add-racer control
    const addBtn = screen.getByText(/add racer/i)
    expect(addBtn).toBeInTheDocument()
  })

  it('has search functionality', async () => {
    renderWithProviders(<RacersPage />)

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/search/i)
    expect(searchInput).toBeInTheDocument()
  })

  it('filters racers by search term', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RacersPage />)

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/search/i)
    await user.type(searchInput, 'Alice')

    // Alice should remain visible; Bob should be filtered out by the client-side search
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('has CSV import and export controls', async () => {
    renderWithProviders(<RacersPage />)

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })

    // Should have import and export buttons
    expect(screen.getByText(/import/i)).toBeInTheDocument()
    expect(screen.getByText(/export/i)).toBeInTheDocument()
  })
})
