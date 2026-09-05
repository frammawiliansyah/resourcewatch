import { ArrowDown, ArrowUp, Network } from 'lucide-react'
import { formatRate } from '../../lib/format'
import { COLOR } from '../../lib/theme'
import type { Snapshot } from '../../lib/types'
import { Sparkline } from '../charts/Sparkline'
import { Card } from './Card'

export function NetworkCard({ snapshot, history }: { snapshot: Snapshot; history: Snapshot[] }) {
  const rxData = history.map((s) => s.network.rx_bytes_per_sec)
  const txData = history.map((s) => s.network.tx_bytes_per_sec)

  return (
    <Card icon={Network} title="Network">
      <div className="flex flex-col gap-3">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-sm">
            <ArrowDown size={13} className="text-[var(--good)]" />
            <span className="font-medium tabular-nums">
              {formatRate(snapshot.network.rx_bytes_per_sec)}
            </span>
          </div>
          <Sparkline data={rxData} color={COLOR.good} height={28} />
        </div>
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-sm">
            <ArrowUp size={13} className="text-[var(--accent)]" />
            <span className="font-medium tabular-nums">
              {formatRate(snapshot.network.tx_bytes_per_sec)}
            </span>
          </div>
          <Sparkline data={txData} color={COLOR.accent} height={28} />
        </div>
      </div>
    </Card>
  )
}
