import { useEffect, useState } from 'react'
import { fetchHistory } from '../lib/api'
import type { HistoryResponse, MetricKey, RangeKey } from '../lib/types'

const cache = new Map<string, HistoryResponse>()

export interface HistoryState {
  data: HistoryResponse | null
  loading: boolean
  error: string | null
}

export function useHistory(
  metric: MetricKey,
  range: RangeKey,
  extra?: Record<string, string>,
): HistoryState {
  const extraKey = extra ? JSON.stringify(extra) : ''
  const cacheKey = `${metric}:${range}:${extraKey}`
  const [state, setState] = useState<HistoryState>(() => {
    const cached = cache.get(cacheKey)
    return { data: cached ?? null, loading: !cached, error: null }
  })

  useEffect(() => {
    let cancelled = false
    const cached = cache.get(cacheKey)
    setState({ data: cached ?? null, loading: !cached, error: null })

    fetchHistory(metric, range, extra)
      .then((data) => {
        if (cancelled) return
        cache.set(cacheKey, data)
        setState({ data, loading: false, error: null })
      })
      .catch((err: Error) => {
        if (cancelled) return
        setState((prev) => ({ ...prev, loading: false, error: err.message }))
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])

  return state
}
