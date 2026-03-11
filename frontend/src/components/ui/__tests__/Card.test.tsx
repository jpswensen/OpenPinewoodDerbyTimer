import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card } from '../Card'

describe('Card', () => {
  it('renders children content', () => {
    render(<Card>Card content</Card>)
    expect(screen.getByText('Card content')).toBeInTheDocument()
  })

  it('applies default styling classes', () => {
    render(<Card data-testid="card">content</Card>)
    const card = screen.getByTestId('card')
    expect(card.className).toContain('rounded-lg')
    expect(card.className).toContain('border')
    expect(card.className).toContain('shadow-sm')
  })

  it('accepts additional className', () => {
    render(<Card className="my-custom" data-testid="card">content</Card>)
    expect(screen.getByTestId('card').className).toContain('my-custom')
  })

  it('passes through HTML div attributes', () => {
    render(<Card data-testid="card" id="my-card">content</Card>)
    expect(screen.getByTestId('card')).toHaveAttribute('id', 'my-card')
  })
})
