import { Fan } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchFans } from '../../lib/api'
import { FAN_MODES } from '../../lib/fanModes'
import { formatFanLabel } from '../../lib/format'
import { COLOR } from '../../lib/theme'
import type { FanCurve, Snapshot } from '../../lib/types'
import { Card } from './Card'

/**
 * The firmware curve as a step plot, with a marker at the current temperature
 * so it's obvious whether the curve is actually asking for more airflow right
 * now. A curve that plateaus below 100% shows up immediately here.
 */
function CurvePlot({ curve, currentTemp }: { curve: FanCurve; currentTemp: number | null }) {
  const { points } = curve
  if (points.length === 0) return null

  const W = 240
  const H = 64
  const PAD = 4
  const temps = points.map((p) => p.temp_c)
  const minT = Math.min(...temps)
  const maxT = Math.max(...temps)
  const span = maxT - minT || 1

  const x = (t: number) => PAD + ((t - minT) / span) * (W - PAD * 2)
  const y = (pct: number) => H - PAD - (pct / 100) * (H - PAD * 2)

  const path = points.map((p) => `${x(p.temp_c).toFixed(1)},${y(p.pct).toFixed(1)}`).join(' ')
  const markerT =
    currentTemp !== null ? Math.min(Math.max(currentTemp, minT), maxT) : null

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} role="img"
      aria-label={`${formatFanLabel(curve.label)} curve`}>
      <polyline points={path} fill="none" stroke={COLOR.accent} strokeWidth={1.5} />
      {points.map((p) => (
        <circle key={`${p.temp_c}-${p.pwm}`} cx={x(p.temp_c)} cy={y(p.pct)} r={1.8} fill={COLOR.accent} />
      ))}
      {markerT !== null && (
        <line x1={x(markerT)} y1={PAD} x2={x(markerT)} y2={H - PAD}
          stroke={COLOR.warn} strokeWidth={1} strokeDasharray="2 2" />
      )}
    </svg>
  )
}

export function FanCurveCard({ snapshot }: { snapshot: Snapshot }) {
  const [curves, setCurves] = useState<FanCurve[] | null>(null)

  const { fans } = snapshot
  const mode = fans.mode
  const controlMode = fans.control_mode

  // Curve tables only change with the fan mode, or when the firmware resets the
  // custom curve (which flips control_mode), so refetch just on those changes.
  useEffect(() => {
    let cancelled = false
    fetchFans()
      .then((report) => {
        if (!cancelled) setCurves(report.curves)
      })
      .catch(() => {
        if (!cancelled) setCurves([])
      })
    return () => {
      cancelled = true
    }
  }, [mode, controlMode])

  if (!fans.available) {
    return <Card icon={Fan} title="Fan Curve" unavailable unavailableMessage="No fan sensors found" />
  }
  if (curves?.length === 0) {
    return <Card icon={Fan} title="Fan Curve" unavailable unavailableMessage="No curve exposed by firmware" />
  }

  /** Curve temperatures are CPU or GPU depending on which fan they drive. */
  const tempForCurve = (label: string): number | null =>
    /gpu/i.test(label) ? snapshot.gpu.temp_c : snapshot.cpu.temp_c

  const modeLabel = FAN_MODES.find((m) => m.mode === mode)?.label

  return (
    <Card icon={Fan} title="Fan Curve" headline={modeLabel}>
      {curves === null && <span className="text-xs text-[var(--text-muted)]">Loading curve...</span>}
      {curves?.map((curve) => (
        <div key={curve.label} className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>{formatFanLabel(curve.label)}</span>
            <span>{curve.enabled ? 'active' : 'inactive'}</span>
          </div>
          <CurvePlot curve={curve} currentTemp={tempForCurve(curve.label)} />
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] tabular-nums text-[var(--text-muted)]">
            {curve.points.map((p) => (
              <span key={`${p.temp_c}-${p.pwm}`}>
                {p.temp_c}° <span className="text-[var(--text)]">{p.pct}%</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </Card>
  )
}
