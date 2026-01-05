import type { Component } from 'solid-js'
import type { CalculationMode } from '../types/physics'

interface ModeSelectorProps {
  mode: CalculationMode
  onModeChange: (mode: CalculationMode) => void
}

export const ModeSelector: Component<ModeSelectorProps> = (props) => {
  return (
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 py-3 px-3">
      <div class="flex flex-col sm:flex-row sm:items-center gap-3">
        <span class="text-sm font-medium text-gray-700 shrink-0">Calculate:</span>
        <div class="flex rounded-lg bg-gray-100 p-1 w-full sm:w-auto">
          <button
            onClick={() => props.onModeChange('thickness')}
            class={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
              props.mode === 'thickness'
                ? 'bg-white shadow-sm text-gray-900 ring-1 ring-gray-200'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Min Thickness
          </button>
          <button
            onClick={() => props.onModeChange('speed')}
            class={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
              props.mode === 'speed'
                ? 'bg-white shadow-sm text-gray-900 ring-1 ring-gray-200'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Max Impact Speed
          </button>
        </div>
      </div>
      <p class="text-xs text-gray-500 mt-2">
        {props.mode === 'thickness'
          ? 'Given impact speed → find minimum required protector thickness'
          : 'Given protector thickness → find maximum safe impact speed'}
      </p>
    </div>
  )
}
