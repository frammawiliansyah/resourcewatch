import { Thermometer } from 'lucide-react'
import { useState } from 'react'
import { setFanMode } from '../../lib/api'
import { FAN_MODES } from '../../lib/fanModes'
import { formatFanLabel, formatTemp } from '../../lib/format'
import { COLOR, colorForLevel, levelForTemp } from '../../lib/theme'
import type { FanMode, Snapshot } from '../../lib/types'
import { Sparkline } from '../charts/Sparkline'
import { Card } from './Card'

/** The backend enforces this; checking here just avoids offering buttons it would reject. */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

export function ThermalCard({ snapshot, history }: { snapshot: Snapshot; history: Snapshot[] }) {
  const [pendingMode, setPendingMode] = useState<FanMode | null>(null)
  const [modeError, setModeError] = useState<string | null>(null)

  const { fans } = snapshot
  const mode = fans.mode

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
                <span>{formatFanLabel(f.label)}</span>
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
        </>
      )}
    </Card>
  )
}
