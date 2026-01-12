import { type Component, For } from 'solid-js'
import type { CalculationMode } from '../types/physics'

interface ModeSelectorProps {
  mode: CalculationMode
  onModeChange: (mode: CalculationMode) => void
}

const modeConfig: Array<{
  mode: CalculationMode
  label: string
  description: string
}> = [
  {
    mode: 'thickness',
    label: 'Min Thickness',
    description:
      'Given impact speed, jerk limit and peak-G cap → compute required compression stroke and foam thickness.',
  },
  {
    mode: 'speed',
    label: 'Max Speed',
    description:
      'Given foam thickness (and max compression), jerk limit and peak-G cap → compute max safe impact speed.',
  },
  {
    mode: 'jerk',
    label: 'Min Jerk',
    description:
      'Given impact speed, available compression stroke and peak-G cap → compute the minimum jerk limit required.',
  },
  {
    mode: 'peakG',
    label: 'Peak G',
    description:
      'Given impact speed, available compression stroke and jerk limit → compute the peak G you will experience.',
  },
]

export const ModeSelector: Component<ModeSelectorProps> = (props) => {
  const currentDescription = () => modeConfig.find((c) => c.mode === props.mode)?.description ?? ''

  return (
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 py-3 px-3">
      <div class="flex flex-col sm:flex-row sm:items-center gap-3">
        <span class="text-sm font-medium text-gray-700 shrink-0">Calculate:</span>
        <div class="flex flex-wrap rounded-lg bg-gray-100 p-1 w-full sm:w-auto gap-0.5">
          <For each={modeConfig}>
            {(config) => (
              <button
                onClick={() => props.onModeChange(config.mode)}
                class={`flex-1 sm:flex-none px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
                  props.mode === config.mode
                    ? 'bg-white shadow-sm text-gray-900 ring-1 ring-gray-200'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {config.label}
              </button>
            )}
          </For>
        </div>
      </div>
      <p class="text-xs text-gray-500 mt-2">{currentDescription()}</p>
    </div>
  )
}
