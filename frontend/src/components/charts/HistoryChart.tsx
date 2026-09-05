import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

export interface HistorySeries {
  key: string
  label: string
  color: string
  valueFormat?: (v: number) => string
}

interface HistoryChartProps {
  points: Record<string, unknown>[]
  series: HistorySeries[]
  height?: number
}

/** Full time-axis chart with grid, cursor tooltip and legend, used in the
 * bottom history panel. Distinct from Sparkline, which is axis-free. */
export function HistoryChart({ points, series, height = 260 }: HistoryChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const opts: uPlot.Options = {
      width: el.clientWidth || 600,
      height,
      pxAlign: false,
      padding: [12, 12, 0, 0],
      cursor: { points: { show: false } },
      scales: { x: { time: true } },
      axes: [
        {
          stroke: '#8590a6',
          grid: { stroke: '#232b3a', width: 1 },
          ticks: { show: false },
        },
        {
          stroke: '#8590a6',
          grid: { stroke: '#232b3a', width: 1 },
          ticks: { show: false },
          values: (_u, vals) =>
            vals.map((v) => series[0]?.valueFormat?.(v) ?? String(v)),
        },
      ],
      series: [
        {},
        ...series.map((s) => ({
          label: s.label,
          stroke: s.color,
          width: 1.75,
          points: { show: false },
          value: (_u: uPlot, v: number | null) =>
            v === null ? '—' : (s.valueFormat?.(v) ?? String(v)),
        })),
      ],
    }

    const plot = new uPlot(opts, buildData(points, series), el)
    plotRef.current = plot

    const observer = new ResizeObserver(() => {
      if (el.clientWidth > 0) plot.setSize({ width: el.clientWidth, height })
    })
    observer.observe(el)

    return () => {
      observer.disconnect()
      plot.destroy()
      plotRef.current = null
    }
    // Rebuilt when the series definition changes; point updates flow through setData below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, height])

  useEffect(() => {
    plotRef.current?.setData(buildData(points, series))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points])

  return <div className="history-chart" ref={containerRef} style={{ width: '100%', height }} />
}

function buildData(points: Record<string, unknown>[], series: HistorySeries[]): uPlot.AlignedData {
  const xs = points.map((p) => Number(p.ts) / 1000)
  const ys = series.map((s) => points.map((p) => (p[s.key] as number | null) ?? null))
  return [xs, ...ys] as uPlot.AlignedData
}
