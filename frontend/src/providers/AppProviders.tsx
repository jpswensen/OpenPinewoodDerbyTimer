import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Theme as RadixTheme } from '@radix-ui/themes'
import { useMemo } from 'react'
import { BrowserRouter } from 'react-router-dom'

import { ThemeProvider, useTheme } from '../context/theme'
import { ToastProvider } from '../components/ui/Toast'

type Props = { children: ReactNode }

function InnerProviders({ children }: Props) {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
    [],
  )

  const { mode } = useTheme()

  return (
    <RadixTheme appearance={mode} accentColor="blue" grayColor="slate" radius="medium">
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>{children}</BrowserRouter>
        </QueryClientProvider>
      </ToastProvider>
    </RadixTheme>
  )
}

export function AppProviders({ children }: Props) {
  return (
    <ThemeProvider>
      <InnerProviders>{children}</InnerProviders>
    </ThemeProvider>
  )
}
