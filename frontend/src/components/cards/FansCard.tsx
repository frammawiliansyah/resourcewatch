import { Fan } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchFans } from '../../lib/api'
import { COLOR, colorForLevel, levelForTemp } from '../../lib/theme'
import type { FanCurve, Snapshot } from '../../lib/types'
import { Sparkline } from '../charts/Sparkline'
import { Card } from './Card'

/** `cpu_fan` -> `CPU fan`, `asus fan1` -> `Asus fan1`. */
function prettyLabel(label: string): string {
  const spaced = label.replace(/_/g, ' ')
  return spaced.replace(/\b(cpu|gpu)\b/gi, (m) => m.toUpperCase()).replace(/^./, (c) => c.toUpperCase())
}

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
      aria-label={`${prettyLabel(curve.label)} curve`}>
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

export function FansCard({ snapshot, history }: { snapshot: Snapshot; history: Snapshot[] }) {
  const [showCurve, setShowCurve] = useState(false)
  const [curves, setCurves] = useState<FanCurve[] | null>(null)

  // Curves are static config, so they're fetched once when first revealed
  // rather than riding along with every snapshot.
  useEffect(() => {
    if (!showCurve || curves) return
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
  }, [showCurve, curves])

  const { fans } = snapshot

  if (!fans.available || fans.fans.length === 0) {
    return <Card icon={Fan} title="Fans" unavailable unavailableMessage="No fan sensors found" />
  }

  const primary = fans.fans[0]
  const data = history.map((s) => s.fans.fans[0]?.rpm ?? 0)
  const level = levelForTemp(snapshot.cpu.temp_c)

  /** Curve temperatures are CPU or GPU depending on which fan they drive. */
  const tempForCurve = (label: string): number | null =>
    /gpu/i.test(label) ? snapshot.gpu.temp_c : snapshot.cpu.temp_c

  return (
    <Card icon={Fan} title="Fans" level={level} headline={`${primary.rpm.toLocaleString()} RPM`}>
      <Sparkline data={data} color={colorForLevel(level)} />

      <div className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
        {fans.fans.map((f) => (
          <div key={f.label} className="flex items-center justify-between">
            <span>{prettyLabel(f.label)}</span>
            <span className="tabular-nums text-[var(--text)]">{f.rpm.toLocaleString()} RPM</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>{fans.control_mode ?? 'unknown mode'}</span>
        {fans.platform_profile && <span>{fans.platform_profile}</span>}
      </div>

      <button
        type="button"
        onClick={() => setShowCurve((v) => !v)}
        className="self-start text-xs text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text)]"
      >
        {showCurve ? 'Hide curve' : 'Show curve'}
      </button>

      {showCurve && (
        <div className="flex flex-col gap-3">
          {curves === null && <span className="text-xs text-[var(--text-muted)]">Loading curve...</span>}
          {curves?.length === 0 && (
            <span className="text-xs text-[var(--text-muted)]">No curve exposed by firmware</span>
          )}
          {curves?.map((curve) => (
            <div key={curve.label} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>{prettyLabel(curve.label)}</span>
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
        </div>
      )}
    </Card>
  )
}
