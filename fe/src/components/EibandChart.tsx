import * as echarts from 'echarts'
import type { Component } from 'solid-js'
import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'

interface EibandChartProps {
  peakG: number
  t1: number // ramp time in seconds
  t2: number // plateau time in seconds
}

const voluntaryExposuresUpperBorder: Array<[number, number]> = [
  [0.0010173477631999525, 16.23074494927855],
  [0.04223150706918974, 16.1285859476968],
  [0.09735059903950005, 10.789099444902604],
  [0.1585845834326859, 5.160080792757715],
  [0.1894662497585145, 5.156009768537915],
]

const severeInjuryLowerBorder: Array<[number, number]> = [
  [0.002050581879799004, 108.16216601448848],
  [0.002349452244612513, 108.09690447529124],
  [0.0026631283896921504, 102.65782613486408],
  [0.0030502764231991352, 96.4972326585293],
  [0.0034211480030140245, 89.79292778806305],
  [0.0037969549584540205, 82.70918114621657],
  [0.004126751659995041, 76.1913442283838],
  [0.00472434721840916, 65.32896859623318],
  [0.00563909224155168, 54.872357621593004],
  [0.0067987966407463615, 42.47119631173926],
  [0.050189977167099456, 42.52841719068853],
  [0.14265055004945293, 29.009253912939315],
  [0.4062637905536649, 28.874885112782117],
]

const ejectionSeatLimits: Array<[number, number]> = [
  [0.0020276802535046843, 93.75483428055225],
  [0.0027375789946177125, 50.21370119787024],
  [0.003773578030145456, 26.079720236401933],
  [0.004228231532642825, 20.19226061059395],
  [0.004594985857465339, 18.224900335015334],
  [0.01531084093401514, 18.127855196137414],
  [0.03055031266990525, 18.25792912341902],
  [0.08701098009724725, 18.359932074853067],
  [0.422569035615455, 18.04640160076953],
  [0.4996555178150913, 18.40516461780827],
  [0.500092631586684, 21.672712494269543],
  [0.45536112899718517, 23.769353293330294],
  [0.08181781872677986, 23.228252881190535],
  [0.029029184956577813, 23.098130421026966],
  [0.014247913498416706, 23.171167113796407],
  [0.005915151687421305, 23.50051850489384],
  [0.005055751114277136, 23.51689004631889],
  [0.004374079108301381, 32.29783780892416],
  [0.00320642857025481, 61.551231168368716],
  [0.002773647780555395, 81.98280280281577],
  [0.0023019164050395525, 118.51578919824284],
  [0.0019894797394446584, 134.05674393868992],
  [0.0020292323102220557, 108.1671877645572],
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

    // Y-axis max: accommodate both reference curves and user profile
    let yMax = 200
    if (props.peakG > 150) {
      yMax = 10 ** Math.ceil(Math.log10(props.peakG * 1.2))
    }

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
