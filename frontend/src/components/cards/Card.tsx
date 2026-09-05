import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ThresholdLevel } from '../../lib/theme'
import { colorForLevel } from '../../lib/theme'

interface CardProps {
  icon: LucideIcon
  title: string
  level?: ThresholdLevel
  headline?: string
  unavailable?: boolean
  unavailableMessage?: string
  children?: ReactNode
}

export function Card({
  icon: Icon,
  title,
  level,
  headline,
  unavailable,
  unavailableMessage,
  children,
}: CardProps) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[var(--text-muted)]">
          <Icon size={16} strokeWidth={2} />
          <span className="text-xs font-medium uppercase tracking-wide">{title}</span>
        </div>
        {level && (
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: colorForLevel(level) }}
          />
        )}
      </div>

      {unavailable ? (
        <div className="flex flex-1 items-center justify-center py-4 text-sm text-[var(--text-muted)]">
          {unavailableMessage ?? 'Not available'}
        </div>
      ) : (
        <>
          {headline && (
            <div className="text-2xl font-semibold tabular-nums">{headline}</div>
          )}
          {children}
        </>
      )}
    </div>
  )
}
