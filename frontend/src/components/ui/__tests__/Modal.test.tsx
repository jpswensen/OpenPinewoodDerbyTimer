import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from '../Modal'

describe('Modal', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}}>
        <p>Hidden</p>
      </Modal>,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders children and title when open', () => {
    render(
      <Modal open={true} title="Test Modal" onClose={() => {}}>
        <p>Modal body</p>
      </Modal>,
    )
    expect(screen.getByText('Test Modal')).toBeInTheDocument()
    expect(screen.getByText('Modal body')).toBeInTheDocument()
  })

  it('has role="dialog" and aria-modal', () => {
    render(
      <Modal open={true} onClose={() => {}}>
        <p>Content</p>
      </Modal>,
    )
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    let closed = false
    render(
      <Modal open={true} title="Title" onClose={() => { closed = true }}>
        <p>Content</p>
      </Modal>,
    )
    await user.click(screen.getByLabelText('Close'))
    expect(closed).toBe(true)
  })

  it('calls onClose when backdrop is clicked', async () => {
    const user = userEvent.setup()
    let closed = false
    render(
      <Modal open={true} onClose={() => { closed = true }}>
        <p>Content</p>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    await user.click(dialog)
    expect(closed).toBe(true)
  })
})
