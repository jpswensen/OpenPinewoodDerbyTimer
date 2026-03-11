import type { TableHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Props = TableHTMLAttributes<HTMLTableElement>

export function Table({ className, ...props }: Props) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn(
          'w-full border-collapse text-sm',
          '[&_th]:border-b [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold',
          '[&_td]:border-b [&_td]:px-3 [&_td]:py-2',
          'border-slate-200 dark:border-slate-800',
          className,
        )}
        {...props}
      />
    </div>
  )
}
