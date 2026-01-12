import type { Component } from 'solid-js'
import type { PhysicsResult } from '../types/physics'

interface StatsPanelProps {
  result: PhysicsResult
  class?: string
}

export const StatsPanel: Component<StatsPanelProps> = (props) => {
  // Check if values exceed proposed EN limits
  const isOver38GLimit = () => props.result.timeOver38G >= 0.007 // 7 ms
  const isOver20GLimit = () => props.result.timeOver20G >= 0.025 // 25 ms

  const isOverAnyLimit = () => isOver38GLimit() || isOver20GLimit()

  return (
    <section class={`border border-black p-3 space-y-4 ${props.class || ''}`}>
      <h2 class="text-lg font-semibold">Profile timing</h2>

      <div class="grid gap-2 text-sm">
        <div class="flex justify-between">
          <span class="text-gray-600">Time to peak G:</span>
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

        <div class="pt-2 border-t border-black mt-2 space-y-2">
          <div class="flex justify-between">
            <span class="text-gray-600">Time over 38 G:</span>
            <span
              class="font-semibold"
              classList={{
                'text-red-600': isOver38GLimit(),
              }}
            >
              {props.result.timeOver38G ? (props.result.timeOver38G * 1000).toFixed(2) : '0.00'} ms
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Time over 20 G:</span>
            <span
              class="font-semibold"
              classList={{
                'text-red-600': isOver20GLimit(),
              }}
            >
              {props.result.timeOver20G ? (props.result.timeOver20G * 1000).toFixed(2) : '0.00'} ms
            </span>
          </div>
        </div>

        {isOverAnyLimit() && (
          <div class="border border-black bg-red-50 px-3 py-2 text-xs text-red-800">
            Over proposed EN limits (38 G for 7 ms or 20 G for 25 ms)
          </div>
        )}
      </div>
    </section>
  )
}
