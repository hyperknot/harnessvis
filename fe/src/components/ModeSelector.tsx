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
    <div class="border border-black p-3">
      <div class="flex flex-col sm:flex-row sm:items-center gap-3">
        <span class="text-sm font-medium text-gray-700 shrink-0">Calculate:</span>
        <div class="flex flex-wrap border border-black w-full sm:w-auto">
          <For each={modeConfig}>
            {(config) => (
              <button
                onClick={() => props.onModeChange(config.mode)}
                class={`flex-1 sm:flex-none px-3 py-2 text-sm font-medium transition-colors border-r border-black last:border-r-0 ${
                  props.mode === config.mode
                    ? 'bg-black text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
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
