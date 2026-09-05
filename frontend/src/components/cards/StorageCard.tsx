import { HardDrive } from 'lucide-react'
import { formatBytes, formatPct } from '../../lib/format'
import { colorForLevel, levelForPct } from '../../lib/theme'
import type { Snapshot } from '../../lib/types'
import { Card } from './Card'

export function StorageCard({ snapshot }: { snapshot: Snapshot }) {
  const { mounts } = snapshot.storage
  const worstLevel = mounts.reduce<'good' | 'warn' | 'bad'>((acc, m) => {
    const l = levelForPct(m.pct)
    if (l === 'bad' || acc === 'bad') return l === 'bad' ? 'bad' : acc
    if (l === 'warn' || acc === 'warn') return 'warn'
    return acc
  }, 'good')

  return (
    <Card icon={HardDrive} title="Storage" level={worstLevel}>
      <div className="flex flex-col gap-3">
        {mounts.map((m) => {
          const level = levelForPct(m.pct)
          return (
            <div key={m.mount_point} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate text-[var(--text)]">{m.mount_point}</span>
                <span className="text-[var(--text-muted)]">
                  {formatBytes(m.used_bytes)} / {formatBytes(m.total_bytes)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]">
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{ width: `${Math.min(m.pct, 100)}%`, background: colorForLevel(level) }}
                />
              </div>
              <span className="self-end text-[10px] text-[var(--text-muted)]">
                {formatPct(m.pct)}
              </span>
            </div>
          )
        })}
        {mounts.length === 0 && (
          <div className="py-2 text-center text-xs text-[var(--text-muted)]">
            No mounted volumes reported
          </div>
        )}
      </div>
    </Card>
  )
}
