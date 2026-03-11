import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ToastProvider, useToast } from '../Toast'
import type { ToastVariant } from '../Toast'

type ToastTriggerProps = { variant?: ToastVariant }

function ToastTrigger({ variant = 'info' as const }: ToastTriggerProps) {
  const { toast } = useToast()
  return (
    <button onClick={() => toast({ title: 'Test toast', description: 'A description', variant })}>
      Show Toast
    </button>
  )
}

describe('Toast', () => {
  it('shows a toast notification when triggered', async () => {
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    )

    await act(async () => {
      screen.getByText('Show Toast').click()
    })

    expect(screen.getByText('Test toast')).toBeInTheDocument()
    expect(screen.getByText('A description')).toBeInTheDocument()
  })

  it('auto-removes toast after duration', async () => {
    vi.useFakeTimers()
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    )

    await act(async () => {
      screen.getByText('Show Toast').click()
    })
    expect(screen.getByText('Test toast')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.queryByText('Test toast')).not.toBeInTheDocument()

    vi.useRealTimers()
  })

  it('applies success border style', async () => {
    render(
      <ToastProvider>
        <ToastTrigger variant="success" />
      </ToastProvider>,
    )
    await act(async () => {
      screen.getByText('Show Toast').click()
    })

    const toast = screen.getByText('Test toast').parentElement!
    expect(toast.className).toContain('border-emerald')
  })

  it('applies error border style', async () => {
    render(
      <ToastProvider>
        <ToastTrigger variant="error" />
      </ToastProvider>,
    )
    await act(async () => {
      screen.getByText('Show Toast').click()
    })

    const toast = screen.getByText('Test toast').parentElement!
    expect(toast.className).toContain('border-red')
  })

  it('throws when useToast is used outside provider', () => {
    function BadComponent() {
      useToast()
      return null
    }
    expect(() => render(<BadComponent />)).toThrow('useToast must be used within ToastProvider')
  })
})
