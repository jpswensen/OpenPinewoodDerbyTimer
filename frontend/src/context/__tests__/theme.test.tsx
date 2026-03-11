import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, useTheme } from '../../context/theme'

function ThemeDisplay() {
  const { mode, toggle } = useTheme()
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <button onClick={toggle}>Toggle</button>
    </div>
  )
}

describe('ThemeProvider / useTheme', () => {
  it('provides a default theme mode', () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    )
    const mode = screen.getByTestId('mode').textContent
    expect(['light', 'dark']).toContain(mode)
  })

  it('toggles theme mode', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    )
    const initial = screen.getByTestId('mode').textContent!
    await user.click(screen.getByText('Toggle'))
    const toggled = screen.getByTestId('mode').textContent
    expect(toggled).not.toBe(initial)
  })

  it('persists theme to localStorage', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    )
    await user.click(screen.getByText('Toggle'))
    const stored = localStorage.getItem('pwdtimer-theme')
    expect(['light', 'dark']).toContain(stored)
  })

  it('applies dark class to documentElement', () => {
    localStorage.setItem('pwdtimer-theme', 'dark')
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    )
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('throws when useTheme is used outside provider', () => {
    function Bad() {
      useTheme()
      return null
    }
    expect(() => render(<Bad />)).toThrow('useTheme must be used within ThemeProvider')
  })
})
