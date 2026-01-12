import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { calculateFoamThickness } from '../lib/physics'
import type { CalculationMode, PhysicsResult } from '../types/physics'

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

  const peakGValue = () => {
    if (props.mode === 'peakG') return props.peakG ?? 0
    return props.result.peakG ?? 0
  }

  const availableStrokeLabel = () => {
    if (props.availableStrokeCm == null) return '—'
    return `${props.availableStrokeCm.toFixed(2)} cm`
  }

  return (
    <section class="p-4">
      <h2 class="text-lg font-semibold mb-3">Summary</h2>
      <div class="flex flex-col gap-2 text-sm">
        <Show when={props.mode === 'thickness'}>
          <div class="flex justify-between items-center">
            <span class="text-gray-600">Compression stroke:</span>
            <span class="font-semibold text-lg text-blue-600">
              {props.result.stopDistance
                ? `${(props.result.stopDistance * 100).toFixed(2)} cm`
                : '—'}
            </span>
          </div>

          <div class="flex justify-between items-center">
            <span class="text-gray-600">Foam thickness:</span>
            <span class="font-semibold text-lg text-emerald-600">
              {props.result.stopDistance ? `${foamThickness().toFixed(2)} cm` : '—'}
            </span>
          </div>

          <div class="flex justify-between items-center">
            <span class="text-gray-600">{peakGLabel()}</span>
            <span
              class="font-semibold text-lg "
              classList={{
                'text-red-600': props.result.gLimitReached,
                'text-gray-900': !props.result.gLimitReached,
              }}
            >
              {props.result.ok && props.result.peakG ? `${props.result.peakG.toFixed(2)} G` : '—'}
            </span>
          </div>
        </Show>

        <Show when={props.mode === 'speed'}>
          <div class="flex justify-between items-center">
            <span class="text-gray-600">Max impact speed:</span>
            <span class="font-semibold text-emerald-600">
              {props.result.ok && props.maxImpactSpeed
                ? `${props.maxImpactSpeed.toFixed(2)} m/s`
                : '—'}
            </span>
          </div>

          <div class="flex justify-between items-center">
            <span class="text-gray-600">{peakGLabel()}</span>
            <span
              class="font-semibold"
              classList={{
                'text-red-600': props.result.gLimitReached,
                'text-gray-900': !props.result.gLimitReached,
              }}
            >
              {props.result.ok && props.result.peakG ? `${props.result.peakG.toFixed(2)} G` : '—'}
            </span>
          </div>

          <div class="flex justify-between items-center">
            <span class="text-gray-600">Available stroke:</span>
            <span class="font-semibold text-blue-600">{availableStrokeLabel()}</span>
          </div>
        </Show>

        <Show when={props.mode === 'jerk'}>
          <div class="flex justify-between items-center">
            <span class="text-gray-600">Min jerk required:</span>
            <span class="font-semibold text-emerald-600">
              {props.result.ok && props.minJerk ? `${props.minJerk.toFixed(0)} G/s` : '—'}
            </span>
          </div>

          <div class="flex justify-between items-center">
            <span class="text-gray-600">{peakGLabel()}</span>
            <span
              class="font-semibold"
              classList={{
                'text-red-600': props.result.gLimitReached,
                'text-gray-900': !props.result.gLimitReached,
              }}
            >
              {props.result.ok && props.result.peakG ? `${props.result.peakG.toFixed(2)} G` : '—'}
            </span>
          </div>

          <div class="flex justify-between items-center">
            <span class="text-gray-600">Available stroke:</span>
            <span class="font-semibold text-blue-600">{availableStrokeLabel()}</span>
          </div>
        </Show>

        <Show when={props.mode === 'peakG'}>
          <div class="flex justify-between items-center">
            <span class="text-gray-600">{peakGLabel()}</span>
            <span class="font-semibold text-emerald-600">
              {props.result.ok && peakGValue() ? `${peakGValue().toFixed(2)} G` : '—'}
            </span>
          </div>

          <div class="flex justify-between items-center">
            <span class="text-gray-600">Available stroke:</span>
            <span class="font-semibold text-blue-600">{availableStrokeLabel()}</span>
          </div>
        </Show>
      </div>
    </section>
  )
}
