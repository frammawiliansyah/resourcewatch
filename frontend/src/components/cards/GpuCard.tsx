import { Gpu } from 'lucide-react'
import { formatBytes, formatPct, formatTemp } from '../../lib/format'
import { colorForLevel, levelForPct } from '../../lib/theme'
import type { GpuProcess, Snapshot } from '../../lib/types'
import { Sparkline } from '../charts/Sparkline'
import { Card } from './Card'

const MAX_ROWS = 5

function ProcessList({
  title,
  processes,
  emptyMessage,
}: {
  title: string
  processes: GpuProcess[]
  emptyMessage: string
}) {
  const shown = processes.slice(0, MAX_ROWS)
  const hidden = processes.length - shown.length

  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
        <span className="font-medium uppercase tracking-wide">{title}</span>
        <span>
          {processes.length} {processes.length === 1 ? 'process' : 'processes'}
        </span>
      </div>
      {shown.length === 0 ? (
        <span className="text-[var(--text-muted)]">{emptyMessage}</span>
      ) : (
        shown.map((p) => (
          <div key={p.pid} className="flex items-center justify-between gap-2">
            <span className="truncate text-[var(--text)]" title={`${p.name} (pid ${p.pid})`}>
              {p.name}
            </span>
            <span className="shrink-0 tabular-nums text-[var(--text-muted)]">
              {p.util_pct !== null ? formatPct(p.util_pct) : '-'}
              {p.mem_bytes !== null ? ` · ${formatBytes(p.mem_bytes)}` : ''}
            </span>
          </div>
        ))
      )}
      {hidden > 0 && <span className="text-[10px] text-[var(--text-muted)]">+{hidden} more</span>}
    </div>
  )
}

export function GpuCard({ snapshot, history }: { snapshot: Snapshot; history: Snapshot[] }) {
  const { gpu, intel_gpu: intel } = snapshot

  if (!gpu.available && !intel.available) {
    return <Card icon={Gpu} title="GPU" unavailable unavailableMessage="No GPU detected" />
  }

  const level = levelForPct(gpu.util_pct)
  const data = history.map((s) => s.gpu.util_pct ?? 0)

  return (
    <Card
      icon={Gpu}
      title="GPU"
      level={gpu.available ? level : undefined}
      headline={gpu.available ? formatPct(gpu.util_pct) : undefined}
    >
      {gpu.available && (
        <>
          <Sparkline data={data} color={colorForLevel(level)} />
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>
              NVIDIA {formatBytes(gpu.mem_used_bytes)} / {formatBytes(gpu.mem_total_bytes)}
            </span>
            <span>
              {formatTemp(gpu.temp_c)}
              {gpu.power_w !== null ? ` · ${gpu.power_w.toFixed(0)}W` : ''}
            </span>
          </div>
        </>
      )}

      <ProcessList
        title="Intel"
        processes={intel.processes}
        emptyMessage={intel.available ? 'No processes' : 'Per-process usage needs deploy/gpu-clients'}
      />
      {gpu.available && (
        <ProcessList title="NVIDIA" processes={gpu.processes} emptyMessage="No processes" />
      )}
    </Card>
  )
}
