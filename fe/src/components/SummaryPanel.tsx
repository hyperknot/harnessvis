import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { calculateFoamThickness } from '../lib/physics'
import type { CalculationMode, PhysicsResult } from '../types/physics'

interface SummaryPanelProps {
  mode: CalculationMode
  result: PhysicsResult
  compressionFactor: number
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
    // In peakG mode, result.maxG is a solved value, not a user cap.
    if (props.mode === 'peakG') return 'Peak G experienced:'
    return `Peak G (limit ${props.result.maxG.toFixed(0)} G):`
  }

  const peakGValue = () => {
    // In peakG mode we show the dedicated computed value (same as result.peakG, but explicit).
    if (props.mode === 'peakG') return props.peakG ?? 0
    return props.result.peakG ?? 0
  }

  return (
    <section class="bg-white rounded-lg shadow-sm border border-gray-200 py-2 px-3">
      <div class="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-around gap-3 sm:gap-3">
        {/* Mode: thickness */}
        <Show when={props.mode === 'thickness'}>
          <div class="flex flex-col items-center min-w-0">
            <span class="text-sm text-gray-600 text-center leading-tight break-words max-w-full">
              Required compression distance:
            </span>
            <span class="text-base md:text-xl font-bold text-blue-600">
              {props.result.stopDistance
                ? `${(props.result.stopDistance * 100).toFixed(2)} cm`
                : '—'}
            </span>
          </div>

          <div class="flex flex-col items-center min-w-0">
            <span class="text-sm text-gray-600 text-center leading-tight break-words max-w-full">
              Required foam thickness:
            </span>
            <span class="text-base md:text-xl font-bold text-emerald-600">
              {props.result.stopDistance ? `${foamThickness().toFixed(2)} cm` : '—'}
            </span>
          </div>

          <div class="flex flex-col items-center min-w-0">
            <span class="text-sm text-gray-600 text-center leading-tight break-words max-w-full">
              {peakGLabel()}
            </span>
            <span
              class="text-base md:text-xl font-bold"
              classList={{
                'text-red-600': props.result.gLimitReached,
                'text-gray-900': !props.result.gLimitReached,
              }}
            >
              {props.result.peakG ? `${props.result.peakG.toFixed(2)} G` : '—'}
            </span>
          </div>
        </Show>

        {/* Mode: speed */}
        <Show when={props.mode === 'speed'}>
          <div class="flex flex-col items-center min-w-0">
            <span class="text-sm text-gray-600 text-center leading-tight break-words max-w-full">
              Max safe impact speed:
            </span>
            <span class="text-base md:text-xl font-bold text-emerald-600">
              {props.maxImpactSpeed ? `${props.maxImpactSpeed.toFixed(2)} m/s` : '—'}
            </span>
          </div>

          <div class="flex flex-col items-center min-w-0">
            <span class="text-sm text-gray-600 text-center leading-tight break-words max-w-full">
              {peakGLabel()}
            </span>
            <span
              class="text-base md:text-xl font-bold"
              classList={{
                'text-red-600': props.result.gLimitReached,
                'text-gray-900': !props.result.gLimitReached,
              }}
            >
              {props.result.peakG ? `${props.result.peakG.toFixed(2)} G` : '—'}
            </span>
          </div>

          <div class="flex flex-col items-center min-w-0">
            <span class="text-sm text-gray-600 text-center leading-tight break-words max-w-full">
              Available compression distance:
            </span>
            <span class="text-base md:text-xl font-bold text-blue-600">
              {props.result.stopDistance
                ? `${(props.result.stopDistance * 100).toFixed(2)} cm`
                : '—'}
            </span>
          </div>
        </Show>

        {/* Mode: jerk */}
        <Show when={props.mode === 'jerk'}>
          <div class="flex flex-col items-center min-w-0">
            <span class="text-sm text-gray-600 text-center leading-tight break-words max-w-full">
              Min jerk required:
            </span>
            <span class="text-base md:text-xl font-bold text-emerald-600">
              {props.minJerk ? `${props.minJerk.toFixed(0)} G/s` : '—'}
            </span>
          </div>

          <div class="flex flex-col items-center min-w-0">
            <span class="text-sm text-gray-600 text-center leading-tight break-words max-w-full">
              {peakGLabel()}
            </span>
            <span
              class="text-base md:text-xl font-bold"
              classList={{
                'text-red-600': props.result.gLimitReached,
                'text-gray-900': !props.result.gLimitReached,
              }}
            >
              {props.result.peakG ? `${props.result.peakG.toFixed(2)} G` : '—'}
            </span>
          </div>

          <div class="flex flex-col items-center min-w-0">
            <span class="text-sm text-gray-600 text-center leading-tight break-words max-w-full">
              Available compression distance:
            </span>
            <span class="text-base md:text-xl font-bold text-blue-600">
              {props.result.stopDistance
                ? `${(props.result.stopDistance * 100).toFixed(2)} cm`
                : '—'}
            </span>
          </div>
        </Show>

        {/* Mode: peakG */}
        <Show when={props.mode === 'peakG'}>
          <div class="flex flex-col items-center min-w-0">
            <span class="text-sm text-gray-600 text-center leading-tight break-words max-w-full">
              {peakGLabel()}
            </span>
            <span class="text-base md:text-xl font-bold text-emerald-600">
              {props.peakG ? `${props.peakG.toFixed(2)} G` : '—'}
            </span>
          </div>

          <div class="flex flex-col items-center min-w-0">
            <span class="text-sm text-gray-600 text-center leading-tight break-words max-w-full">
              Available compression distance:
            </span>
            <span class="text-base md:text-xl font-bold text-blue-600">
              {props.result.stopDistance
                ? `${(props.result.stopDistance * 100).toFixed(2)} cm`
                : '—'}
            </span>
          </div>
        </Show>
      </div>
    </section>
  )
}
