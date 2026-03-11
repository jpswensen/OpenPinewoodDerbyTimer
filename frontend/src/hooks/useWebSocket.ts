import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type WSStatus = 'disconnected' | 'connecting' | 'connected'

export type UseWebSocketOptions = {
  path?: string
  token?: string
  onJsonMessage?: (data: unknown) => void
  reconnect?: boolean
}

function buildWsUrl(path: string, token?: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const base = `${proto}://${window.location.host}${path.startsWith('/') ? '' : '/'}${path}`
  if (!token) return base
  const url = new URL(base)
  url.searchParams.set('token', token)
  return url.toString()
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { path = '/ws', token, onJsonMessage, reconnect = true } = options

  const url = useMemo(() => buildWsUrl(path, token), [path, token])

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const connectRef = useRef<() => void>(() => {})

  const [status, setStatus] = useState<WSStatus>('disconnected')
  const [lastMessage, setLastMessage] = useState<string | null>(null)

  const connect = useCallback(() => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return
    }

    setStatus('connecting')
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setStatus('connected')
    ws.onclose = () => {
      setStatus('disconnected')
      wsRef.current = null
      if (reconnect) {
        if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = window.setTimeout(() => connectRef.current(), 1000)
      }
    }
    ws.onerror = () => {
      // Let onclose handle reconnect logic.
    }
    ws.onmessage = (evt) => {
      setLastMessage(String(evt.data))
      try {
        const parsed = JSON.parse(String(evt.data))
        onJsonMessage?.(parsed)
      } catch {
        // ignore non-json messages
      }
    }
  }, [onJsonMessage, reconnect, url])

  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    wsRef.current?.close()
    wsRef.current = null
    setStatus('disconnected')
  }, [])

  const sendJson = useCallback((data: unknown) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify(data))
    return true
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  return { status, lastMessage, connect, disconnect, sendJson }
}
