import type { RangeKey } from '../lib/types'

const RANGES: RangeKey[] = ['15m', '1h', '6h', '24h', '3d']

export function TimeRangePicker({
  value,
  onChange,
}: {
  value: RangeKey
  onChange: (range: RangeKey) => void
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-[var(--surface-raised)] p-0.5 text-xs">
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
            value === r ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-muted)]'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  )
}
