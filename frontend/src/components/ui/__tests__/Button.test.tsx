import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '../Button'

describe('Button', () => {
  it('renders with children text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument()
  })

  it('defaults to type="button"', () => {
    render(<Button>OK</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('fires onClick handler', async () => {
    const user = userEvent.setup()
    let clicked = false
    render(<Button onClick={() => { clicked = true }}>Go</Button>)
    await user.click(screen.getByRole('button'))
    expect(clicked).toBe(true)
  })

  it('applies primary variant classes by default', () => {
    render(<Button>Primary</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('bg-blue-600')
    expect(btn.className).toContain('text-white')
  })

  it('applies secondary variant classes', () => {
    render(<Button variant="secondary">Sec</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('bg-slate-100')
  })

  it('applies ghost variant classes', () => {
    render(<Button variant="ghost">Ghost</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('bg-transparent')
  })

  it('is disabled when disabled prop is set', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('passes additional className', () => {
    render(<Button className="extra-class">Styled</Button>)
    expect(screen.getByRole('button').className).toContain('extra-class')
  })
})
