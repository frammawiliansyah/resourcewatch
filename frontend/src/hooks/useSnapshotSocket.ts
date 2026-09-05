import { useEffect, useRef, useState } from 'react'
import { fetchSnapshot, wsUrl } from '../lib/api'
import type { Snapshot } from '../lib/types'

const MAX_BUFFER = 120
const MAX_BACKOFF_MS = 10_000

export interface SnapshotSocketState {
  snapshot: Snapshot | null
  history: Snapshot[]
  connected: boolean
}

export function useSnapshotSocket(): SnapshotSocketState {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [connected, setConnected] = useState(false)

  const bufferRef = useRef<Snapshot[]>([])

  useEffect(() => {
    let cancelled = false
    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let backoffMs = 500

    fetchSnapshot()
      .then((snap) => {
        if (!cancelled) setSnapshot(snap)
      })
      .catch(() => {
        /* WS connection below will populate this shortly */
      })

    function connect() {
      socket = new WebSocket(wsUrl('/ws'))

      socket.onopen = () => {
        backoffMs = 500
        setConnected(true)
      }

      socket.onmessage = (event) => {
        try {
          const snap: Snapshot = JSON.parse(event.data)
          setSnapshot(snap)
          const next = [...bufferRef.current, snap].slice(-MAX_BUFFER)
          bufferRef.current = next
          setHistory(next)
        } catch {
          /* ignore malformed frame */
        }
      }

      const scheduleReconnect = () => {
        setConnected(false)
        if (cancelled) return
        reconnectTimer = setTimeout(connect, backoffMs)
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
      }

      socket.onclose = scheduleReconnect
      socket.onerror = () => socket?.close()
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [])

  return { snapshot, history, connected }
}
