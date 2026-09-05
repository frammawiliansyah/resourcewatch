import { Gpu } from 'lucide-react'
import { formatBytes, formatPct, formatTemp } from '../../lib/format'
import { colorForLevel, levelForPct } from '../../lib/theme'
import type { Snapshot } from '../../lib/types'
import { Sparkline } from '../charts/Sparkline'
import { Card } from './Card'

export function GpuCard({ snapshot, history }: { snapshot: Snapshot; history: Snapshot[] }) {
  const { gpu } = snapshot

  if (!gpu.available) {
    return (
      <Card icon={Gpu} title="GPU" unavailable unavailableMessage="No GPU detected" />
    )
  }

  const level = levelForPct(gpu.util_pct)
  const data = history.map((s) => s.gpu.util_pct ?? 0)

  return (
    <Card icon={Gpu} title="GPU" level={level} headline={formatPct(gpu.util_pct)}>
      <Sparkline data={data} color={colorForLevel(level)} />
      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>
          {formatBytes(gpu.mem_used_bytes)} / {formatBytes(gpu.mem_total_bytes)}
        </span>
        <span>
          {formatTemp(gpu.temp_c)}
          {gpu.power_w !== null ? ` · ${gpu.power_w.toFixed(0)}W` : ''}
        </span>
      </div>
    </Card>
  )
}
