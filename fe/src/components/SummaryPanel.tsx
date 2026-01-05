import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { calculateFoamThickness } from '../lib/physics'
import type { CalculationMode, PhysicsResult } from '../types/physics'

interface SummaryPanelProps {
  mode: CalculationMode
  result: PhysicsResult
  compressionFactor: number
  maxImpactSpeed?: number
}

export const SummaryPanel: Component<SummaryPanelProps> = (props) => {
  const foamThickness = () => {
    if (!props.result.stopDistance) return 0
    return calculateFoamThickness(props.result.stopDistance * 100, props.compressionFactor)
  }

  return (
    <section class="bg-white rounded-lg shadow-sm border border-gray-200 py-2 px-3">
      <div class="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-around gap-3 sm:gap-3">
        <div class="flex flex-col items-center min-w-0">
          <span class="text-sm text-gray-600 text-center leading-tight">Peak G:</span>
          <span
            class="text-base md:text-xl font-bold"
            classList={{
              'text-red-600': props.result.gLimitReached,
            }}
          >
            {props.result.peakG ? `${props.result.peakG.toFixed(2)} G` : '—'}
          </span>
        </div>

        {/* Mode: thickness - show thickness outputs */}
        <Show when={props.mode === 'thickness'}>
          <div class="flex flex-col items-center min-w-0">
            <span class="text-sm text-gray-600 text-center leading-tight break-words max-w-full">
              Min theoretical thickness:
            </span>
            <span class="text-base md:text-xl font-bold text-blue-600">
              {props.result.stopDistance
                ? `${(props.result.stopDistance * 100).toFixed(2)} cm`
                : '—'}
            </span>
          </div>

          <div class="flex flex-col items-center min-w-0">
            <span class="text-sm text-gray-600 text-center leading-tight break-words max-w-full">
              Min foam thickness:
            </span>
            <span class="text-base md:text-xl font-bold text-emerald-600">
              {props.result.stopDistance ? `${foamThickness().toFixed(2)} cm` : '—'}
            </span>
          </div>
        </Show>

        {/* Mode: speed - show speed output */}
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
              Compression distance:
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
