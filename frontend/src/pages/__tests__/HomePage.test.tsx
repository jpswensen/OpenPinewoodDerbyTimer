import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/test-utils'
import { HomePage } from '../../pages/HomePage'

describe('HomePage', () => {
  it('renders the title', () => {
    renderWithProviders(<HomePage />)
    expect(screen.getByText('PWDTimer')).toBeInTheDocument()
  })

  it('renders the description', () => {
    renderWithProviders(<HomePage />)
    expect(screen.getByText(/modernized race management/i)).toBeInTheDocument()
  })

  it('renders navigation hint', () => {
    renderWithProviders(<HomePage />)
    expect(screen.getByText(/sidebar/i)).toBeInTheDocument()
  })
})
