import { Cpu } from 'lucide-react'
import { formatPct, formatTemp } from '../../lib/format'
import { colorForLevel, levelForPct } from '../../lib/theme'
import type { Snapshot } from '../../lib/types'
import { Sparkline } from '../charts/Sparkline'
import { Card } from './Card'

export function CpuCard({ snapshot, history }: { snapshot: Snapshot; history: Snapshot[] }) {
  const level = levelForPct(snapshot.cpu.usage_pct)
  const data = history.map((s) => s.cpu.usage_pct)

  return (
    <Card icon={Cpu} title="CPU" level={level} headline={formatPct(snapshot.cpu.usage_pct)}>
      <Sparkline data={data} color={colorForLevel(level)} />
      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>{snapshot.cpu.per_core.length} cores</span>
        <span>{formatTemp(snapshot.cpu.temp_c)}</span>
      </div>
    </Card>
  )
}
