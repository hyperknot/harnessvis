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
      'Given impact speed, jerk limit and max G → compute required compression stroke and foam thickness.',
  },
  {
    mode: 'speed',
    label: 'Max Impact Speed',
    description: 'Given foam thickness, jerk limit and max G → compute max safe impact speed.',
  },
  {
    mode: 'jerk',
    label: 'Min Jerk',
    description:
      'Given impact speed, available compression stroke and max G → compute the minimum jerk limit required.',
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
    <div class="p-4">
      <div class="flex flex-col sm:flex-row sm:items-center gap-3">
        <div class="flex flex-wrap border border-neutral-900 w-full sm:w-auto">
          <For each={modeConfig}>
            {(config) => (
              <button
                onClick={() => props.onModeChange(config.mode)}
                class="flex-1 sm:flex-none px-3 py-2 text-sm font-medium transition-colors border-r border-black last:border-r-0"
                classList={{
                  'bg-neutral-900 text-white': props.mode === config.mode,
                  'bg-white text-gray-900 hover:bg-gray-100': props.mode !== config.mode,
                }}
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
