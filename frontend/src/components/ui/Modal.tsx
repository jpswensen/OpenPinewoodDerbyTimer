import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'

type Props = {
  open: boolean
  title?: string
  onClose: () => void
  children: ReactNode
}

export function Modal({ open, title, onClose, children }: Props) {
  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={cn('w-full max-w-xl rounded-lg bg-white p-4 shadow-lg dark:bg-slate-900')}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold">{title || ''}</h3>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
