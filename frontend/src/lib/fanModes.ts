import type { FanMode } from './types'

export const FAN_MODES: { mode: FanMode; label: string }[] = [
  { mode: 'auto', label: 'Auto' },
  { mode: '50', label: '50%' },
  { mode: '75', label: '75%' },
  { mode: '100', label: '100%' },
]
