import * as echarts from 'echarts'
import type { Component } from 'solid-js'
import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'

interface EibandChartProps {
  peakG: number
  t1: number // ramp time in seconds
  t2: number // plateau time in seconds
}

const voluntaryExposuresUpperBorder: Array<[number, number]> = [
  [0.0009935729390135595, 15.941399460636791],
  [0.04122092865563919, 15.941399460636791],
  [0.05012348928825926, 14.615500987002438],
  [0.09858894729743338, 10.043322406119284],
  [0.15097655782848504, 5.044108428149106],
  [0.2049013649094286, 5.044108428149106],
]

const severeInjuryLowerBorder: Array<[number, number]> = [
  [0.001964201291018776, 111.29286286496462],
  [0.002867386386368506, 98.27093868376593],
  [0.0039331308498918235, 79.39782867151824],
  [0.005073661408906773, 56.54568065837158],
  [0.006700096931015743, 42.03353902984052],
  [0.04092584850833768, 42.03353902984052],
  [0.14024800534115195, 27.81227175447444],
]

const ejectionSeatLimits: Array<[number, number]> = [
  [0.0019806895449587148, 94.15896847927742], // Top left (line 4 & 6)
  [0.004193292154673674, 17.96292886154017], // Lower left (line 2 & 6)
  [0.49909592952668713, 17.96292886154017], // Lower right (line 2 & 3)
  [0.4990959295266872, 22.86578914550784], // Upper right (line 1 & 3)
  [0.00483414491763791, 22.865789145507833], // Upper left (line 5 & 1)
  [0.0019806895449587148, 146.16197658996717], // Left peak (line 4 & 5)
  [0.0019806895449587148, 94.15896847927742], // Close back to start
]

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

    const data = calculateGDurationPairs(props.peakG, props.t1, props.t2)

    const option: echarts.EChartsOption = {
      animation: false,
      grid: { left: 60, right: 20, top: 60, bottom: 50 },
      legend: {
        show: true,
        top: 5,
        textStyle: { fontSize: 10 },
        itemWidth: 20,
        itemHeight: 10,
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          if (params.seriesName === 'Profile') {
            const [duration, g] = params.data
            return `Time at ≥ ${g.toFixed(1)} G: ${(duration * 1000).toFixed(2)} ms`
          }
          return params.seriesName
        },
      },
      xAxis: {
        type: 'log',
        name: 'Time spent over given acceleration (s)',
        nameLocation: 'middle',
        nameGap: 30,
        min: 0.001,
        max: 0.15,
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
        max: 130,
        axisLabel: { formatter: '{value}' },
        splitLine: {
          show: true,
          lineStyle: { color: '#e5e7eb', type: 'dashed' },
        },
      },
      series: [
        // Ejection seat design limits (filled polygon)
        {
          name: 'Ejection seat limits',
          type: 'custom',
          renderItem: (params, api) => {
            if (params.dataIndex !== 0) return
            const points = ejectionSeatLimits.map(([x, y]) => api.coord!([x, y]))
            return {
              type: 'polygon',
              shape: { points },
              style: {
                fill: 'rgba(139, 92, 246, 0.15)',
                stroke: '#8b5cf6',
                lineWidth: 1.5,
              },
            }
          },
          data: [0],
          z: 1,
        },
        // Voluntary exposures upper border
        {
          name: 'Voluntary exposure limit',
          type: 'line',
          smooth: false,
          symbol: 'none',
          lineStyle: { width: 2, color: '#22c55e', type: 'dashed' },
          data: voluntaryExposuresUpperBorder,
          z: 2,
        },
        // Severe injury lower border
        {
          name: 'Severe injury threshold',
          type: 'line',
          smooth: false,
          symbol: 'none',
          lineStyle: { width: 2, color: '#ef4444', type: 'dashed' },
          data: severeInjuryLowerBorder,
          z: 2,
        },
        // User's G-duration curve
        {
          name: 'Profile',
          type: 'line',
          smooth: false,
          symbol: 'circle',
          symbolSize: 3,
          lineStyle: { width: 2, color: '#2563eb' },
          itemStyle: { color: '#2563eb' },
          data,
          z: 3,
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

  return <div ref={chartRef} class="w-full h-[500px] min-w-0" />
}
