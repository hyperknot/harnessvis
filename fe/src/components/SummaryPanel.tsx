import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { calculateFoamThickness } from '../lib/physics'
import type { CalculationMode, PhysicsResult } from '../types/physics'

// Reusable stat row component
const StatRow: Component<{
  label: string
  value: string
  color?: 'blue' | 'emerald' | 'red' | 'default'
}> = (props) => (
  <div class="flex justify-between items-center">
    <span class="text-gray-600">{props.label}</span>
    <span
      class="font-semibold text-base"
      classList={{
        'text-blue-600': props.color === 'blue',
        'text-emerald-600': props.color === 'emerald',
        'text-red-600': props.color === 'red',
        'text-gray-900': !props.color || props.color === 'default',
      }}
    >
      {props.value}
    </span>
  </div>
)

interface SummaryPanelProps {
  mode: CalculationMode
  result: PhysicsResult
  compressionFactor: number
  availableStrokeCm?: number
  maxImpactSpeed?: number
  minJerk?: number
  peakG?: number
}

export const SummaryPanel: Component<SummaryPanelProps> = (props) => {
  const foamThickness = () => {
    if (!props.result.stopDistance) return 0
    return calculateFoamThickness(props.result.stopDistance * 100, props.compressionFactor)
  }

  const peakGLabel = () => {
    if (props.mode === 'peakG') return 'Peak G:'
    return `Peak G (limit ${props.result.maxG.toFixed(0)}):`
  }

  const peakGValue = () => (props.mode === 'peakG' ? (props.peakG ?? 0) : (props.result.peakG ?? 0))

  const formatStroke = () =>
    props.result.stopDistance ? `${(props.result.stopDistance * 100).toFixed(2)} cm` : '—'

  const formatFoam = () => (props.result.stopDistance ? `${foamThickness().toFixed(2)} cm` : '—')

  const formatPeakG = () =>
    props.result.ok && props.result.peakG ? `${props.result.peakG.toFixed(2)} G` : '—'

  const formatAvailableStroke = () =>
    props.availableStrokeCm != null ? `${props.availableStrokeCm.toFixed(2)} cm` : '—'

  const peakGColor = (): 'red' | 'default' => (props.result.gLimitReached ? 'red' : 'default')

  return (
    <section class="px-4 py-2">
      <h2 class="text-lg font-semibold mb-2">Summary</h2>
      <div class="flex flex-col gap-2 text-sm">
        <Show when={props.mode === 'thickness'}>
          <StatRow label="Compression stroke:" value={formatStroke()} color="blue" />
          <StatRow label="Foam thickness:" value={formatFoam()} color="emerald" />
          <StatRow label={peakGLabel()} value={formatPeakG()} color={peakGColor()} />
        </Show>

        <Show when={props.mode === 'speed'}>
          <StatRow
            label="Max impact speed:"
            value={
              props.result.ok && props.maxImpactSpeed
                ? `${props.maxImpactSpeed.toFixed(2)} m/s`
                : '—'
            }
            color="emerald"
          />
          <StatRow label={peakGLabel()} value={formatPeakG()} color={peakGColor()} />
          <StatRow label="Available stroke:" value={formatAvailableStroke()} color="blue" />
        </Show>

        <Show when={props.mode === 'jerk'}>
          <StatRow
            label="Min jerk required:"
            value={props.result.ok && props.minJerk ? `${props.minJerk.toFixed(0)} G/s` : '—'}
            color="emerald"
          />
          <StatRow label={peakGLabel()} value={formatPeakG()} color={peakGColor()} />
          <StatRow label="Available stroke:" value={formatAvailableStroke()} color="blue" />
        </Show>

        <Show when={props.mode === 'peakG'}>
          <StatRow
            label={peakGLabel()}
            value={props.result.ok && peakGValue() ? `${peakGValue().toFixed(2)} G` : '—'}
            color="emerald"
          />
          <StatRow label="Available stroke:" value={formatAvailableStroke()} color="blue" />
        </Show>
      </div>
    </section>
  )
}
