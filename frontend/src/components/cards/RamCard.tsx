import { MemoryStick } from 'lucide-react'
import { formatBytes, formatPct } from '../../lib/format'
import { colorForLevel, levelForPct } from '../../lib/theme'
import type { Snapshot } from '../../lib/types'
import { Sparkline } from '../charts/Sparkline'
import { Card } from './Card'

export function RamCard({ snapshot, history }: { snapshot: Snapshot; history: Snapshot[] }) {
  const { used_bytes, total_bytes, swap_used_bytes, swap_total_bytes } = snapshot.ram
  const pct = total_bytes > 0 ? (used_bytes / total_bytes) * 100 : 0
  const level = levelForPct(pct)
  const data = history.map((s) =>
    s.ram.total_bytes > 0 ? (s.ram.used_bytes / s.ram.total_bytes) * 100 : 0,
  )

  return (
    <Card icon={MemoryStick} title="RAM" level={level} headline={formatPct(pct)}>
      <Sparkline data={data} color={colorForLevel(level)} />
      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>
          {formatBytes(used_bytes)} / {formatBytes(total_bytes)}
        </span>
        {swap_total_bytes > 0 && (
          <span>swap {formatBytes(swap_used_bytes)}</span>
        )}
      </div>
    </Card>
  )
}
