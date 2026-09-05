import { ListOrdered } from 'lucide-react'
import { useState } from 'react'
import { formatBytes, formatPct } from '../lib/format'
import type { Snapshot } from '../lib/types'

export function ProcessesTable({ snapshot }: { snapshot: Snapshot }) {
  const [tab, setTab] = useState<'cpu' | 'mem'>('cpu')
  const rows = tab === 'cpu' ? snapshot.processes.top_cpu : snapshot.processes.top_mem

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[var(--text-muted)]">
          <ListOrdered size={16} strokeWidth={2} />
          <span className="text-xs font-medium uppercase tracking-wide">Top Processes</span>
        </div>
        <div className="flex gap-1 rounded-lg bg-[var(--surface-raised)] p-0.5 text-xs">
          {(['cpu', 'mem'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                tab === key
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-muted)]'
              }`}
            >
              {key === 'cpu' ? 'CPU' : 'RAM'}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead>
            <tr className="text-xs text-[var(--text-muted)]">
              <th className="pb-2 font-medium">PID</th>
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 text-right font-medium">CPU</th>
              <th className="pb-2 text-right font-medium">RAM</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.pid} className="border-t border-[var(--border)]">
                <td className="py-1.5 text-[var(--text-muted)] tabular-nums">{p.pid}</td>
                <td className="py-1.5 truncate max-w-[180px]">{p.name}</td>
                <td className="py-1.5 text-right tabular-nums">{formatPct(p.cpu_pct, 1)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatBytes(p.mem_bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
