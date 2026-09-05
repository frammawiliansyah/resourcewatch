import { BatteryCharging, BatteryMedium } from 'lucide-react'
import { formatDuration, formatPct } from '../../lib/format'
import { colorForLevel, levelForBattery } from '../../lib/theme'
import type { Snapshot } from '../../lib/types'
import { Sparkline } from '../charts/Sparkline'
import { Card } from './Card'

export function BatteryCard({ snapshot, history }: { snapshot: Snapshot; history: Snapshot[] }) {
  const { battery } = snapshot

  if (!battery.available) {
    return (
      <Card icon={BatteryMedium} title="Battery" unavailable unavailableMessage="No battery (desktop)" />
    )
  }

  const level = levelForBattery(battery.pct)
  const data = history.map((s) => s.battery.pct ?? 0)
  const charging = battery.status?.toLowerCase() === 'charging'

  return (
    <Card
      icon={charging ? BatteryCharging : BatteryMedium}
      title="Battery"
      level={level}
      headline={formatPct(battery.pct)}
    >
      <Sparkline data={data} color={colorForLevel(level)} />
      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>{battery.status ?? 'Unknown'}</span>
        {!charging && battery.time_to_empty_secs !== null && (
          <span>{formatDuration(battery.time_to_empty_secs)} left</span>
        )}
      </div>
    </Card>
  )
}
