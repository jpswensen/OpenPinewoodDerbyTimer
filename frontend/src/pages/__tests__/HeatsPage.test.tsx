import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/test-utils'
import { HeatsPage } from '../../pages/HeatsPage'

describe('HeatsPage', () => {
  it('loads and displays races', async () => {
    renderWithProviders(<HeatsPage />)

    await waitFor(() => {
      const matches = screen.getAllByText('Spring Derby')
      expect(matches.length).toBeGreaterThan(0)
    })
  })

  it('shows the Heats heading', async () => {
    renderWithProviders(<HeatsPage />)

    await waitFor(() => {
      expect(screen.getByText('Heats')).toBeInTheDocument()
    })
  })

  it('shows generate heats button', async () => {
    renderWithProviders(<HeatsPage />)

    await waitFor(() => {
      expect(screen.getByText('Generate heats')).toBeInTheDocument()
    })
  })

  it('shows progress panel', async () => {
    renderWithProviders(<HeatsPage />)

    await waitFor(() => {
      expect(screen.getByText('Progress')).toBeInTheDocument()
    })
  })

  it('has new race button', async () => {
    renderWithProviders(<HeatsPage />)

    await waitFor(() => {
      expect(screen.getByText('+ New race')).toBeInTheDocument()
    })
  })

  it('has print heat sheet button', async () => {
    renderWithProviders(<HeatsPage />)

    await waitFor(() => {
      expect(screen.getByText('Print heat sheet')).toBeInTheDocument()
    })
  })
})
