import { Thermometer } from 'lucide-react'
import { formatTemp } from '../../lib/format'
import { colorForLevel, levelForTemp } from '../../lib/theme'
import type { Snapshot } from '../../lib/types'
import { Sparkline } from '../charts/Sparkline'
import { Card } from './Card'

export function TemperatureCard({
  snapshot,
  history,
}: {
  snapshot: Snapshot
  history: Snapshot[]
}) {
  const cpuTemp = snapshot.cpu.temp_c
  const gpuTemp = snapshot.gpu.available ? snapshot.gpu.temp_c : null
  const worst = Math.max(cpuTemp ?? -Infinity, gpuTemp ?? -Infinity)
  const level = levelForTemp(Number.isFinite(worst) ? worst : null)
  const data = history.map((s) => s.cpu.temp_c ?? 0)

  if (cpuTemp === null && gpuTemp === null) {
    return (
      <Card icon={Thermometer} title="Temperature" unavailable unavailableMessage="No sensors found" />
    )
  }

  return (
    <Card icon={Thermometer} title="Temperature" level={level}>
      <Sparkline data={data} color={colorForLevel(level)} />
      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>CPU {formatTemp(cpuTemp)}</span>
        {snapshot.gpu.available && <span>GPU {formatTemp(gpuTemp)}</span>}
      </div>
    </Card>
  )
}
