import { useMemo, useState } from 'react'
import { useHistory } from '../hooks/useHistory'
import { COLOR } from '../lib/theme'
import type { MetricKey, RangeKey, Snapshot } from '../lib/types'
import { HistoryChart, type HistorySeries } from './charts/HistoryChart'
import { TimeRangePicker } from './TimeRangePicker'

const METRIC_OPTIONS: { key: MetricKey; label: string; requiresGpu?: boolean }[] = [
  { key: 'cpu', label: 'CPU' },
  { key: 'ram', label: 'RAM' },
  { key: 'gpu', label: 'GPU', requiresGpu: true },
  { key: 'network', label: 'Network' },
  { key: 'diskio', label: 'Disk I/O' },
  { key: 'storage', label: 'Storage' },
  { key: 'temperature', label: 'Temperature' },
  { key: 'battery', label: 'Battery' },
]

function seriesFor(metric: MetricKey): HistorySeries[] {
  switch (metric) {
    case 'cpu':
      return [{ key: 'usage_pct', label: 'Usage', color: COLOR.accent, valueFormat: (v) => `${v.toFixed(0)}%` }]
    case 'ram':
      return [{ key: 'used_pct', label: 'Used', color: COLOR.accent, valueFormat: (v) => `${v.toFixed(0)}%` }]
    case 'gpu':
      return [{ key: 'util_pct', label: 'Utilization', color: COLOR.accent, valueFormat: (v) => `${v.toFixed(0)}%` }]
    case 'network':
      return [
        { key: 'rx_bytes_per_sec', label: 'Down', color: COLOR.good, valueFormat: formatRateShort },
        { key: 'tx_bytes_per_sec', label: 'Up', color: COLOR.accent, valueFormat: formatRateShort },
      ]
    case 'diskio':
      return [
        { key: 'read_bytes_per_sec', label: 'Read', color: COLOR.good, valueFormat: formatRateShort },
        { key: 'write_bytes_per_sec', label: 'Write', color: COLOR.accent, valueFormat: formatRateShort },
      ]
    case 'storage':
      return [{ key: 'pct', label: 'Used', color: COLOR.accent, valueFormat: (v) => `${v.toFixed(0)}%` }]
    case 'temperature':
      return [
        { key: 'cpu_temp_c', label: 'CPU', color: COLOR.accent, valueFormat: (v) => `${v.toFixed(0)}°C` },
        { key: 'gpu_temp_c', label: 'GPU', color: COLOR.warn, valueFormat: (v) => `${v.toFixed(0)}°C` },
      ]
    case 'battery':
      return [{ key: 'pct', label: 'Charge', color: COLOR.good, valueFormat: (v) => `${v.toFixed(0)}%` }]
  }
}

function formatRateShort(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)}B/s`
  if (bytesPerSec < 1024 ** 2) return `${(bytesPerSec / 1024).toFixed(0)}K/s`
  return `${(bytesPerSec / 1024 ** 2).toFixed(1)}M/s`
}

/** RAM history rows carry raw byte counts; derive a usage percentage the
 * same way the RamCard does so both views agree. */
function withDerivedFields(metric: MetricKey, points: Record<string, unknown>[]) {
  if (metric !== 'ram') return points
  return points.map((p) => {
    const used = Number(p.used_bytes)
    const total = Number(p.total_bytes)
    return { ...p, used_pct: total > 0 ? (used / total) * 100 : 0 }
  })
}

export function HistoryPanel({ latest }: { latest: Snapshot | null }) {
  const [metric, setMetric] = useState<MetricKey>('cpu')
  const [range, setRange] = useState<RangeKey>('1h')
  const [mount, setMount] = useState<string>('/')

  const extra = metric === 'storage' ? { mount } : undefined
  const { data, loading } = useHistory(metric, range, extra)

  const availableMounts = useMemo(
    () => latest?.storage.mounts.map((m) => m.mount_point) ?? [],
    [latest],
  )

  const points = useMemo(
    () => withDerivedFields(metric, data?.points ?? []),
    [metric, data],
  )
  const series = useMemo(() => seriesFor(metric), [metric])

  const visibleMetrics = METRIC_OPTIONS.filter(
    (m) => !m.requiresGpu || latest?.gpu.available,
  )

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricKey)}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-xs font-medium text-[var(--text)] outline-none"
          >
            {visibleMetrics.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          {metric === 'storage' && availableMounts.length > 0 && (
            <select
              value={mount}
              onChange={(e) => setMount(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-xs font-medium text-[var(--text)] outline-none"
            >
              {availableMounts.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
        </div>
        <TimeRangePicker value={range} onChange={setRange} />
      </div>

      {loading && points.length === 0 ? (
        <div className="flex h-[260px] items-center justify-center text-sm text-[var(--text-muted)]">
          Loading history…
        </div>
      ) : points.length === 0 ? (
        <div className="flex h-[260px] items-center justify-center text-sm text-[var(--text-muted)]">
          No history data yet for this range
        </div>
      ) : (
        <HistoryChart points={points} series={series} />
      )}
    </section>
  )
}
