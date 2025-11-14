import * as echarts from 'echarts'
import type { Component } from 'solid-js'
import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'

interface SamplePoint {
  t: number // seconds
  aG: number // acceleration in G
  v: number
  x: number
}

interface AccelerationProfileChartProps {
  samples: Array<SamplePoint>
}

export const AccelerationProfileChart: Component<AccelerationProfileChartProps> = (props) => {
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

    const data = (props.samples || []).map((p) => [p.t * 1000, p.aG])
    const maxTimeMs = data.length ? data[data.length - 1][0] : 0

    const option: echarts.EChartsOption = {
      animation: false,
      grid: { left: 50, right: 20, top: 30, bottom: 45 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line' },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params
          const tMs = p?.data?.[0] ?? 0
          const aG = p?.data?.[1] ?? 0
          return `t = ${tMs.toFixed(2)} ms<br/>a = ${aG.toFixed(2)} G`
        },
      },
      xAxis: {
        type: 'value',
        name: 'Time (ms)',
        min: 0,
        max: maxTimeMs || undefined,
        axisLabel: { formatter: (value: number) => value.toFixed(1) },
      },
      yAxis: {
        type: 'value',
        name: 'Acceleration (G)',
        axisLabel: { formatter: '{value}' },
        splitLine: { show: true },
      },
      series: [
        {
          name: 'Acceleration',
          type: 'line',
          smooth: false,
          symbol: 'none',
          lineStyle: { width: 2, color: '#2563eb' },
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

  return <div ref={chartRef} class="w-full h-80" />
}
