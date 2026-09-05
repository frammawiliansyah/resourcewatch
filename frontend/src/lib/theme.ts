export const COLOR = {
  accent: '#38bdf8',
  good: '#34d399',
  warn: '#fbbf24',
  bad: '#f87171',
  muted: '#8590a6',
} as const

export type ThresholdLevel = 'good' | 'warn' | 'bad'

/** Standard usage-percentage thresholds: green <60%, amber 60-85%, red >85%. */
export function levelForPct(pct: number | null | undefined, invert = false): ThresholdLevel {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return 'good'
  const p = invert ? 100 - pct : pct
  if (p > 85) return 'bad'
  if (p >= 60) return 'warn'
  return 'good'
}

export function colorForLevel(level: ThresholdLevel): string {
  return COLOR[level]
}

/** CPU/GPU temperature thresholds: green <70°C, amber 70-85°C, red >85°C. */
export function levelForTemp(celsius: number | null | undefined): ThresholdLevel {
  if (celsius === null || celsius === undefined || Number.isNaN(celsius)) return 'good'
  if (celsius > 85) return 'bad'
  if (celsius >= 70) return 'warn'
  return 'good'
}

/** Battery thresholds are inverted from usage bars: red <15%, amber <30%. */
export function levelForBattery(pct: number | null | undefined): ThresholdLevel {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return 'good'
  if (pct < 15) return 'bad'
  if (pct < 30) return 'warn'
  return 'good'
}
