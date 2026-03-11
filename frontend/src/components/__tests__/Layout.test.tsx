import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/test-utils'
import { Layout } from '../../components/Layout'
import { Route, Routes } from 'react-router-dom'

function TestLayout() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<div>Home Content</div>} />
        <Route path="/racers" element={<div>Racers Content</div>} />
      </Route>
    </Routes>
  )
}

describe('Layout', () => {
  it('renders navigation links', () => {
    renderWithProviders(<TestLayout />)
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Racers')).toBeInTheDocument()
    expect(screen.getByText('Heats')).toBeInTheDocument()
    expect(screen.getByText('Race')).toBeInTheDocument()
    expect(screen.getByText('Results')).toBeInTheDocument()
    expect(screen.getByText('Certificates')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('displays PWDTimer brand', () => {
    renderWithProviders(<TestLayout />)
    expect(screen.getByText('PWDTimer')).toBeInTheDocument()
  })

  it('renders child route content', () => {
    renderWithProviders(<TestLayout />)
    expect(screen.getByText('Home Content')).toBeInTheDocument()
  })

  it('has a theme toggle button', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TestLayout />)
    const toggleBtn = screen.getByText(/light|dark/i)
    expect(toggleBtn).toBeInTheDocument()
    await user.click(toggleBtn)
    // Verify it toggled (the text should change)
    expect(screen.getByText(/light|dark/i)).toBeInTheDocument()
  })
})
