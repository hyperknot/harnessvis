import type { Component } from 'solid-js'
import type { PhysicsResult } from '../types/physics'

interface SummaryPanelProps {
  result: PhysicsResult
  class?: string
}

export const SummaryPanel: Component<SummaryPanelProps> = (props) => {
  // Check if values exceed proposed EN limits
  const isOver38GLimit = () => props.result.timeOver38G >= 0.007 // 7 ms
  const isOver20GLimit = () => props.result.timeOver20G >= 0.025 // 25 ms
  const isOverAnyLimit = () => isOver38GLimit() || isOver20GLimit()

  return (
    <section
      class={`bg-white rounded-xl shadow-sm border border-gray-200 py-2 px-3 space-y-4 ${props.class || ''}`}
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

        {/* Time over thresholds - read-only measurements */}
        <div class="py-2 border-t border-gray-200 mt-2 space-y-2">
          <div class="flex justify-between">
            <span class="text-gray-600">Time over 38 G:</span>
            <span class={`font-semibold ${isOver38GLimit() ? 'text-red-600' : ''}`}>
              {props.result.timeOver38G ? (props.result.timeOver38G * 1000).toFixed(2) : '0.00'} ms
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Time over 20 G:</span>
            <span class={`font-semibold ${isOver20GLimit() ? 'text-red-600' : ''}`}>
              {props.result.timeOver20G ? (props.result.timeOver20G * 1000).toFixed(2) : '0.00'} ms
            </span>
          </div>
        </div>

        {/* Warning message if over EN limits */}
        {isOverAnyLimit() && (
          <div class="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
            ⚠️ Over proposed EN limits (38 G for ≥7 ms or 20 G for ≥25 ms)
          </div>
        )}
      </div>
    </section>
  )
}
