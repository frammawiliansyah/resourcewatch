import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import { COLOR } from '../../lib/theme'

interface SparklineProps {
  data: number[]
  color?: string
  height?: number
}

function hexToRgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Minimal, axis-free line chart for realtime per-card sparklines. */
export function Sparkline({ data, color = COLOR.accent, height = 40 }: SparklineProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const opts: uPlot.Options = {
      width: el.clientWidth || 120,
      height,
      pxAlign: false,
      cursor: { show: false },
      legend: { show: false },
      axes: [{ show: false }, { show: false }],
      scales: { x: { time: false } },
      series: [
        {},
        {
          stroke: color,
          width: 1.5,
          fill: hexToRgba(color, 0.15),
          points: { show: false },
        },
      ],
    }

    const xs = data.map((_, i) => i)
    const plot = new uPlot(opts, [xs, data], el)
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
    // Rebuilt only when color/height change; data updates flow through setData below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, height])

  useEffect(() => {
    const xs = data.map((_, i) => i)
    plotRef.current?.setData([xs, data])
  }, [data])

  return <div className="sparkline" ref={containerRef} style={{ width: '100%', height }} />
}
