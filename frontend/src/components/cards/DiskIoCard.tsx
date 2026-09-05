import { Activity, ArrowDown, ArrowUp } from 'lucide-react'
import { formatRate } from '../../lib/format'
import { COLOR } from '../../lib/theme'
import type { Snapshot } from '../../lib/types'
import { Sparkline } from '../charts/Sparkline'
import { Card } from './Card'

export function DiskIoCard({ snapshot, history }: { snapshot: Snapshot; history: Snapshot[] }) {
  const readData = history.map((s) => s.disk_io.read_bytes_per_sec)
  const writeData = history.map((s) => s.disk_io.write_bytes_per_sec)

  return (
    <Card icon={Activity} title="Disk I/O">
      <div className="flex flex-col gap-3">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-sm">
            <ArrowDown size={13} className="text-[var(--good)]" />
            <span className="font-medium tabular-nums">
              {formatRate(snapshot.disk_io.read_bytes_per_sec)}
            </span>
            <span className="text-xs text-[var(--text-muted)]">read</span>
          </div>
          <Sparkline data={readData} color={COLOR.good} height={28} />
        </div>
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-sm">
            <ArrowUp size={13} className="text-[var(--accent)]" />
            <span className="font-medium tabular-nums">
              {formatRate(snapshot.disk_io.write_bytes_per_sec)}
            </span>
            <span className="text-xs text-[var(--text-muted)]">write</span>
          </div>
          <Sparkline data={writeData} color={COLOR.accent} height={28} />
        </div>
      </div>
    </Card>
  )
}
