import * as echarts from 'echarts'
import type { Component } from 'solid-js'
import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'

interface EibandChartProps {
  peakG: number
  t1: number // ramp time in seconds
  t2: number // plateau time in seconds
}

/**
 * Calculates G-duration pairs for the Eiband chart.
 *
 * For a jerk-limited profile, the time spent at or above a given G threshold is:
 *   duration(G) = 2 * t₁ * (1 - G/peakG) + t₂
 *
 * Derivation:
 * - Phase 1 (ramp up): a(t) = j·t reaches threshold at t_enter = threshold·g/j
 * - Phase 3 (ramp down): a drops below threshold at t_exit = t₁ + t₂ + (peakA - threshold·g)/j
 * - Duration = t_exit - t_enter = 2·t₁·(1 - threshold/peakG) + t₂
 */
function calculateGDurationPairs(
  peakG: number,
  t1: number,
  t2: number,
  gStep = 0.1,
): Array<[number, number]> {
  const data: Array<[number, number]> = []

  if (peakG <= 0 || t1 <= 0) return data

  // Sample G values from gStep to peakG in 0.1 G increments
  for (let g = gStep; g <= peakG + 0.001; g += gStep) {
    const gClamped = Math.min(g, peakG)
    const theta = gClamped / peakG
    const duration = 2 * t1 * (1 - theta) + t2

    // Only include points with positive duration (required for log scale)
    if (duration > 1e-6) {
      data.push([duration, gClamped])
    }
  }

  // Ensure we include the peak point if plateau exists
  if (t2 > 1e-6) {
    const lastG = data.length > 0 ? data[data.length - 1][1] : 0
    if (peakG - lastG > gStep / 2) {
      data.push([t2, peakG])
    }
  }

  // Sort by duration ascending for proper line rendering
  data.sort((a, b) => a[0] - b[0])

  return data
}

export const EibandChart: Component<EibandChartProps> = (props) => {
  let chartRef: HTMLDivElement | undefined
  const [chart, setChart] = createSignal<echarts.ECharts | null>(null)

  onMount(() => {
    if (chartRef) {
      const instance = echarts.init(chartRef)
      setChart(instance)
    }
  })

  createEffect(() => {
    const instance = chart()
    if (!instance) return

    const { peakG, t1, t2 } = props
    const data = calculateGDurationPairs(peakG, t1, t2)

    // Calculate Y-axis max based on peak G
    let yMax = 200
    if (peakG > 100) {
      yMax = 10 ** Math.ceil(Math.log10(peakG * 1.2))
    }

    const option: echarts.EChartsOption = {
      animation: false,
      grid: { left: 60, right: 20, top: 30, bottom: 50 },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const [duration, g] = params.data
          return `Time at ≥ ${g.toFixed(1)} G: ${(duration * 1000).toFixed(2)} ms`
        },
      },
      xAxis: {
        type: 'log',
        name: 'Duration of uniform acceleration (s)',
        nameLocation: 'middle',
        nameGap: 30,
        min: 0.001,
        max: 1,
        axisLabel: {
          formatter: (value: number) => {
            if (value < 1) return `${Math.round(value * 1000)}ms`
            return `${value}s`
          },
        },
        splitLine: {
          show: true,
          lineStyle: { color: '#e5e7eb', type: 'dashed' },
        },
      },
      yAxis: {
        type: 'log',
        name: 'Acceleration (G)',
        min: 1,
        max: yMax,
        axisLabel: { formatter: '{value}' },
        splitLine: {
          show: true,
          lineStyle: { color: '#e5e7eb', type: 'dashed' },
        },
      },
      series: [
        {
          name: 'Cumulative time at G',
          type: 'line',
          smooth: false,
          symbol: 'circle',
          symbolSize: 3,
          lineStyle: { width: 2, color: '#2563eb' },
          itemStyle: { color: '#2563eb' },
          data,
        },
      ],
    }

    instance.setOption(option, true)
    instance.resize()
  })

  onCleanup(() => {
    const instance = chart()
    if (instance) {
      instance.dispose()
      setChart(null)
    }
  })

  return <div ref={chartRef} class="w-full h-80 min-w-0" />
}
