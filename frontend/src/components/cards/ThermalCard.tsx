import { Thermometer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchFans, setFanMode } from '../../lib/api'
import { formatTemp } from '../../lib/format'
import { COLOR, colorForLevel, levelForTemp } from '../../lib/theme'
import type { FanCurve, FanMode, Snapshot } from '../../lib/types'
import { Sparkline } from '../charts/Sparkline'
import { Card } from './Card'

const FAN_MODES: { mode: FanMode; label: string }[] = [
  { mode: 'auto', label: 'Auto' },
  { mode: '50', label: '50%' },
  { mode: '75', label: '75%' },
  { mode: '100', label: '100%' },
]

/** The backend enforces this; checking here just avoids offering buttons it would reject. */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

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

export function ThermalCard({ snapshot, history }: { snapshot: Snapshot; history: Snapshot[] }) {
  const [showCurve, setShowCurve] = useState(false)
  const [curveState, setCurveState] = useState<{ mode: FanMode | null; curves: FanCurve[] } | null>(null)
  const [pendingMode, setPendingMode] = useState<FanMode | null>(null)
  const [modeError, setModeError] = useState<string | null>(null)

  const { fans } = snapshot
  const mode = fans.mode

  // Curve tables only change with the fan mode, so fetch on reveal and again after a switch.
  useEffect(() => {
    if (!showCurve || (curveState !== null && curveState.mode === mode)) return
    let cancelled = false
    fetchFans()
      .then((report) => {
        if (!cancelled) setCurveState({ mode, curves: report.curves })
      })
      .catch(() => {
        if (!cancelled) setCurveState({ mode, curves: [] })
      })
    return () => {
      cancelled = true
    }
  }, [showCurve, curveState, mode])

  const cpuTemp = snapshot.cpu.temp_c
  const gpuTemp = snapshot.gpu.available ? snapshot.gpu.temp_c : null
  const worst = Math.max(cpuTemp ?? -Infinity, gpuTemp ?? -Infinity)
  const hottest = Number.isFinite(worst) ? worst : null
  const level = levelForTemp(hottest)
  const hasFans = fans.available && fans.fans.length > 0

  if (hottest === null && !hasFans) {
    return (
      <Card icon={Thermometer} title="Temperature & Fans" unavailable unavailableMessage="No sensors found" />
    )
  }

  const canControl = LOCAL_HOSTNAMES.has(window.location.hostname)
  const curves = curveState !== null && curveState.mode === mode ? curveState.curves : null

  /** Curve temperatures are CPU or GPU depending on which fan they drive. */
  const tempForCurve = (label: string): number | null =>
    /gpu/i.test(label) ? snapshot.gpu.temp_c : snapshot.cpu.temp_c

  const chooseMode = (next: FanMode) => {
    setPendingMode(next)
    setModeError(null)
    setFanMode(next)
      .catch((err: unknown) => setModeError(err instanceof Error ? err.message : String(err)))
      .finally(() => setPendingMode(null))
  }

  return (
    <Card
      icon={Thermometer}
      title="Temperature & Fans"
      level={level}
      headline={hottest !== null ? formatTemp(hottest) : undefined}
    >
      {hottest !== null && (
        <>
          <Sparkline data={history.map((s) => s.cpu.temp_c ?? 0)} color={colorForLevel(level)} height={32} />
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>CPU {formatTemp(cpuTemp)}</span>
            {snapshot.gpu.available && <span>GPU {formatTemp(gpuTemp)}</span>}
          </div>
        </>
      )}

      {hasFans && (
        <>
          <Sparkline data={history.map((s) => s.fans.fans[0]?.rpm ?? 0)} color={COLOR.accent} height={32} />
          <div className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
            {fans.fans.map((f) => (
              <div key={f.label} className="flex items-center justify-between">
                <span>{prettyLabel(f.label)}</span>
                <span className="tabular-nums text-[var(--text)]">{f.rpm.toLocaleString()} RPM</span>
              </div>
            ))}
          </div>

          {mode !== null && (
            <div className="flex flex-col gap-1">
              <div
                role="group"
                aria-label="Fan mode"
                className="grid grid-cols-4 gap-1 rounded-lg border border-[var(--border)] p-1"
              >
                {FAN_MODES.map((option) => {
                  const active = option.mode === mode
                  return (
                    <button
                      key={option.mode}
                      type="button"
                      aria-pressed={active}
                      disabled={!canControl || pendingMode !== null}
                      onClick={() => chooseMode(option.mode)}
                      className={`rounded-md px-2 py-1 text-xs font-medium tabular-nums transition-colors disabled:cursor-not-allowed ${
                        active
                          ? 'text-slate-950'
                          : 'text-[var(--text-muted)] enabled:hover:bg-[var(--border)] enabled:hover:text-[var(--text)]'
                      }`}
                      style={active ? { background: COLOR.accent } : undefined}
                    >
                      {pendingMode === option.mode ? '...' : option.label}
                    </button>
                  )
                })}
              </div>
              {!canControl && (
                <span className="text-[10px] text-[var(--text-muted)]">
                  Fan control is only available from localhost
                </span>
              )}
              {modeError && (
                <span className="text-[10px]" style={{ color: COLOR.bad }}>
                  {modeError}
                </span>
              )}
            </div>
          )}

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
        </>
      )}
    </Card>
  )
}
