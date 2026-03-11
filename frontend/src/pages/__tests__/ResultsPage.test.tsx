import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/test-utils'
import { ResultsPage } from '../../pages/ResultsPage'

describe('ResultsPage', () => {
  it('loads and displays race selection', async () => {
    renderWithProviders(<ResultsPage />)

    await waitFor(() => {
      const matches = screen.getAllByText('Spring Derby')
      expect(matches.length).toBeGreaterThan(0)
    })
  })

  it('renders Results heading', async () => {
    renderWithProviders(<ResultsPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /results/i })).toBeInTheDocument()
    })
  })

  it('shows export PDF button', async () => {
    renderWithProviders(<ResultsPage />)

    await waitFor(() => {
      const pdfBtn = screen.getByText(/export pdf/i)
      expect(pdfBtn).toBeInTheDocument()
    })
  })

  it('shows group filter option', async () => {
    renderWithProviders(<ResultsPage />)

    await waitFor(() => {
      expect(screen.getByText('Overall')).toBeInTheDocument()
    })
  })
})
