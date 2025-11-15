import type { Component } from 'solid-js'
import { createSignal } from 'solid-js'
import { calculateFoamThickness } from '../lib/physics'
import type { PhysicsResult } from '../types/physics'

interface ThicknessPanelProps {
  result: PhysicsResult
}

export const ThicknessPanel: Component<ThicknessPanelProps> = (props) => {
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
    <section class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div class="flex flex-wrap items-center justify-around gap-6">
        {/* Min theoretical thickness */}
        <div class="flex flex-col items-center gap-1">
          <span class="text-sm text-gray-600">Min theoretical protector thickness:</span>
          <span class="text-2xl font-bold text-blue-600">
            {props.result.stopDistance ? `${(props.result.stopDistance * 100).toFixed(2)} cm` : '—'}
          </span>
        </div>

        {/* Foam compression factor input */}
        <div class="flex flex-col items-center gap-1">
          <span class="text-sm text-gray-600">Foam compression factor:</span>
          <div class="flex items-center gap-2">
            <input
              type="number"
              inputmode="decimal"
              min="0"
              step="5"
              value={compressionFactor()}
              onInput={handleCompressionInput}
              class="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-base text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span class="text-lg font-semibold text-gray-700">%</span>
          </div>
        </div>

        {/* Min foam protector thickness */}
        <div class="flex flex-col items-center gap-1">
          <span class="text-sm text-gray-600">Min foam protector thickness:</span>
          <span class="text-2xl font-bold text-emerald-600">
            {props.result.stopDistance ? `${foamThickness().toFixed(2)} cm` : '—'}
          </span>
        </div>
      </div>
    </section>
  )
}
