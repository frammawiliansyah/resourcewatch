import type { HistoryResponse, MetricKey, RangeKey, Snapshot } from './types'

export async function fetchSnapshot(): Promise<Snapshot> {
  const res = await fetch('/api/snapshot')
  if (!res.ok) throw new Error(`GET /api/snapshot failed: ${res.status}`)
  return res.json()
}

export async function fetchHistory(
  metric: MetricKey,
  range: RangeKey,
  extra?: Record<string, string>,
): Promise<HistoryResponse> {
  const params = new URLSearchParams({ metric, range, ...extra })
  const res = await fetch(`/api/history?${params.toString()}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `GET /api/history failed: ${res.status}`)
  }
  return res.json()
}

export function wsUrl(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}
