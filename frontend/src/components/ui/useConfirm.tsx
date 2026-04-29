import { useCallback, useRef, useState } from 'react'

import { ConfirmDialog, type ConfirmOptions } from './ConfirmDialog'

/**
 * Imperative confirm dialog API. Call `confirm(opts)` and render `dialog` once.
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions) => {
    setState(opts)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const handle = useCallback((value: boolean) => {
    setState(null)
    const resolve = resolverRef.current
    resolverRef.current = null
    resolve?.(value)
  }, [])

  const dialog = state ? (
    <ConfirmDialog
      open
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      variant={state.variant}
      onConfirm={() => handle(true)}
      onCancel={() => handle(false)}
    />
  ) : null

  return { confirm, dialog }
}
