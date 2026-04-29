import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/test-utils'
import { HomePage } from '../../pages/HomePage'

describe('HomePage', () => {
  it('renders the title', () => {
    renderWithProviders(<HomePage />)
    expect(screen.getByRole('heading', { name: 'Pinewood Derby Timer' })).toBeInTheDocument()
  })

  it('renders the description', () => {
    renderWithProviders(<HomePage />)
    expect(screen.getByText(/manage racers, schedule heats, and run your derby/i)).toBeInTheDocument()
  })

  it('renders quick actions', () => {
    renderWithProviders(<HomePage />)
    expect(screen.getByRole('heading', { name: 'Quick Actions' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /manage racers/i })).toBeInTheDocument()
  })
})
