import type { Component } from 'solid-js'
import { createSignal } from 'solid-js'
import type { PhysicsResult } from '../types/physics'
import { calculateFoamThickness } from '../utils/physics'

interface SummaryPanelProps {
  result: PhysicsResult
  class?: string
}

export const SummaryPanel: Component<SummaryPanelProps> = (props) => {
  const [compressionFactor, setCompressionFactor] = createSignal(30)

  const handleCompressionInput = (e: Event & { currentTarget: HTMLInputElement }) => {
    const v = Number.parseFloat(e.currentTarget.value)
    setCompressionFactor(Number.isFinite(v) ? Math.max(0, v) : 30)
  }

  const foamThickness = () => {
    if (!props.result.stopDistance) return 0
    return calculateFoamThickness(props.result.stopDistance * 100, compressionFactor())
  }

  return (
    <section
      class={`bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4 ${props.class || ''}`}
    >
      <h2 class="text-lg font-semibold">Profile summary</h2>

      <div class="grid gap-3 text-sm">
        <div class="flex justify-between">
          <span class="text-gray-600">Profile type:</span>
          <span class="font-semibold">
            {props.result.profileType === 'triangular'
              ? 'Triangular (no constant phase)'
              : props.result.profileType === 'trapezoidal'
                ? 'Trapezoidal (with constant phase)'
                : '—'}
          </span>
        </div>

        <div class="flex justify-between">
          <span class="text-gray-600">Peak G used:</span>
          <span class="font-semibold">
            {props.result.peakG ? props.result.peakG.toFixed(2) : '—'} G
          </span>
        </div>

        <div class="flex justify-between">
          <span class="text-gray-600">Max G limit reached?</span>
          <span
            class={`font-semibold ${
              props.result.gLimitReached ? 'text-red-600' : 'text-emerald-600'
            }`}
          >
            {props.result.gLimitReached ? 'Yes' : 'No'}
          </span>
        </div>

        <div class="flex justify-between">
          <span class="text-gray-600">Time to peak G (each side):</span>
          <span class="font-semibold">
            {props.result.t1 ? (props.result.t1 * 1000).toFixed(2) : '—'} ms
          </span>
        </div>

        <div class="flex justify-between">
          <span class="text-gray-600">Constant-G phase:</span>
          <span class="font-semibold">
            {props.result.t2 ? (props.result.t2 * 1000).toFixed(2) : '0.00'} ms
          </span>
        </div>

        <div class="flex justify-between">
          <span class="text-gray-600">Total stop time:</span>
          <span class="font-semibold">
            {props.result.totalTime ? (props.result.totalTime * 1000).toFixed(2) : '—'} ms
          </span>
        </div>

        <div class="flex justify-between">
          <span class="text-gray-600">Time at max G plateau:</span>
          <span class="font-semibold">
            {props.result.timeAtOrAboveLimit
              ? (props.result.timeAtOrAboveLimit * 1000).toFixed(2)
              : '0.00'}{' '}
            ms (limit: {props.result.maxGTimeMs.toFixed(1)} ms)
            {!props.result.gTimeOk && ' ⚠️'}
          </span>
        </div>

        {/* STOPPING DISTANCE - Main highlight */}
        <div class="py-2 border-t border-b border-gray-200 mt-2 space-y-1">
          <div class="text-gray-700 text-xs font-medium">Min theoretical protector thickness:</div>
          <div class="text-xl font-bold text-blue-600">
            {props.result.stopDistance ? `${(props.result.stopDistance * 100).toFixed(2)} cm` : '—'}
          </div>
        </div>

        {/* Foam compression factor input */}
        <div class="flex justify-between items-center pt-2">
          <span class="text-gray-600">Foam compression factor:</span>
          <div class="flex items-center gap-2">
            <input
              type="number"
              inputmode="decimal"
              min="0"
              step="5"
              value={compressionFactor()}
              onInput={handleCompressionInput}
              class="w-20 rounded-md border border-gray-300 px-2 py-1 text-base text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span class="text-sm text-gray-600">%</span>
          </div>
        </div>

        {/* Min foam thickness calculation */}
        <div class="flex justify-between">
          <span class="text-gray-600">Min foam protector thickness:</span>
          <span class="text-lg font-semibold">
            {props.result.stopDistance ? `${foamThickness().toFixed(2)} cm` : '—'}
          </span>
        </div>
      </div>
    </section>
  )
}
