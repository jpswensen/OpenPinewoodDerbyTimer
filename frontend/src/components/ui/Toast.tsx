/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { cn } from '../../lib/cn'

type ToastVariant = 'info' | 'success' | 'error'

type ToastItem = {
  id: string
  title: string
  description?: string
  variant: ToastVariant
}

type ToastContextValue = {
  toast: (t: Omit<ToastItem, 'id'> & { durationMs?: number }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

function genId(): string {
  return Math.random().toString(36).slice(2)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const toast = useCallback((t: Omit<ToastItem, 'id'> & { durationMs?: number }) => {
    const id = genId()
    const item: ToastItem = { id, title: t.title, description: t.description, variant: t.variant }
    setItems((prev) => [item, ...prev].slice(0, 5))

    const duration = t.durationMs ?? 3500
    window.setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id))
    }, duration)
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-[60] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'rounded-md border p-3 shadow-sm',
              'bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-50',
              t.variant === 'success'
                ? 'border-emerald-200 dark:border-emerald-900'
                : t.variant === 'error'
                  ? 'border-red-200 dark:border-red-900'
                  : 'border-slate-200 dark:border-slate-800',
            )}
          >
            <div className="text-sm font-semibold">{t.title}</div>
            {t.description ? <div className="mt-1 text-sm opacity-80">{t.description}</div> : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
