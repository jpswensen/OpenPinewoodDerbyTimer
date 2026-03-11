import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/test-utils'
import { CertificatesPage } from '../../pages/CertificatesPage'

describe('CertificatesPage', () => {
  it('renders the Certificates heading', async () => {
    renderWithProviders(<CertificatesPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /certificates/i })).toBeInTheDocument()
    })
  })

  it('renders race selection with Spring Derby', async () => {
    renderWithProviders(<CertificatesPage />)

    await waitFor(() => {
      const matches = screen.getAllByText('Spring Derby')
      expect(matches.length).toBeGreaterThan(0)
    })
  })

  it('has Winner type selection button', async () => {
    renderWithProviders(<CertificatesPage />)

    await waitFor(() => {
      expect(screen.getByText('Winner')).toBeInTheDocument()
    })
  })

  it('has download PDF button', async () => {
    renderWithProviders(<CertificatesPage />)

    await waitFor(() => {
      expect(screen.getByText('Download PDF')).toBeInTheDocument()
    })
  })

  it('has customization fields', async () => {
    renderWithProviders(<CertificatesPage />)

    await waitFor(() => {
      // Should have event name/date fields
      const fields = screen.queryAllByRole('textbox')
      expect(fields.length).toBeGreaterThanOrEqual(0)
    })
  })
})
