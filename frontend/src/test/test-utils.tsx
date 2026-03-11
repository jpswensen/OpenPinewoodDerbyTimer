import type { ReactElement, ReactNode } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../context/theme'
import { ToastProvider } from '../components/ui/Toast'

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

type WrapperProps = { children: ReactNode }

function AllProviders({ children }: WrapperProps) {
  const queryClient = createTestQueryClient()
  return (
    <ThemeProvider>
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>{children}</MemoryRouter>
        </QueryClientProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & { route?: string },
) {
  const { route, ...renderOptions } = options || {}

  function Wrapper({ children }: WrapperProps) {
    const queryClient = createTestQueryClient()
    return (
      <ThemeProvider>
        <ToastProvider>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={route ? [route] : ['/']}>
              {children}
            </MemoryRouter>
          </QueryClientProvider>
        </ToastProvider>
      </ThemeProvider>
    )
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions })
}

// eslint-disable-next-line react-refresh/only-export-components
export { AllProviders, createTestQueryClient }
