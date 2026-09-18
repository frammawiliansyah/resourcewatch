import { Activity, Maximize2 } from 'lucide-react'
import { useEffect, useState } from 'react'

export function Header({
  connected,
  lastTs,
  onFullscreen,
}: {
  connected: boolean
  lastTs: number | null
  onFullscreen?: () => void
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const secondsAgo = lastTs ? Math.max(0, Math.round((now - lastTs) / 1000)) : null

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-6">
      <div className="flex items-center gap-2">
        <Activity size={20} className="text-[var(--accent)]" />
        <h1 className="text-base font-semibold tracking-tight sm:text-lg">ResourceWatch</h1>
      </div>
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: connected ? 'var(--good)' : 'var(--bad)' }}
        />
        <span>{connected ? 'Live' : 'Reconnecting...'}</span>
        {secondsAgo !== null && (
          <span className="hidden sm:inline">· updated {secondsAgo}s ago</span>
        )}
        {onFullscreen && (
          <button
            type="button"
            onClick={onFullscreen}
            title="Fullscreen (F)"
            aria-label="Enter fullscreen"
            className="ml-2 cursor-pointer rounded-md border border-[var(--border)] p-1.5 hover:bg-[var(--surface-raised)] hover:text-[var(--text)]"
          >
            <Maximize2 size={14} />
          </button>
        )}
      </div>
    </header>
  )
}
