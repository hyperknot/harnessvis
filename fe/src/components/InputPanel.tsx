import type { Component } from 'solid-js'

interface InputPanelProps {
  impactSpeed: number
  jerkG: number
  maxG: number
  maxGTimeMs: number
  onImpactSpeedChange: (value: number) => void
  onJerkGChange: (value: number) => void
  onMaxGChange: (value: number) => void
  onMaxGTimeMsChange: (value: number) => void
  errorMessage?: string
}

export const InputPanel: Component<InputPanelProps> = (props) => {
  const parseNumberInput = (e: Event & { currentTarget: HTMLInputElement }) => {
    const v = Number.parseFloat(e.currentTarget.value)
    return Number.isFinite(v) ? v : 0
  }

  return (
    <section class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
      <h2 class="text-lg font-semibold">Inputs</h2>

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-700">Impact speed</span>
          <div class="flex items-center gap-2">
            <input
              type="number"
              inputmode="decimal"
              min="0"
              step="0.1"
              value={props.impactSpeed}
              onInput={(e) => props.onImpactSpeedChange(parseNumberInput(e))}
              class="w-full rounded-md border border-gray-300 px-2 py-1.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span class="text-sm text-gray-500 whitespace-nowrap">m/s</span>
          </div>
          <span class="text-xs text-gray-500">
            Vertical speed at impact (e.g. 6 m/s ≈ EN drop test)
          </span>
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-700">Max jerk</span>
          <div class="flex items-center gap-2">
            <input
              type="number"
              inputmode="decimal"
              min="1"
              step="50"
              value={props.jerkG}
              onInput={(e) => props.onJerkGChange(parseNumberInput(e))}
              class="w-full rounded-md border border-gray-300 px-2 py-1.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span class="text-sm text-gray-500 whitespace-nowrap">G/s</span>
          </div>
          <span class="text-xs text-gray-500">
            Rate of onset limit (e.g. 1300 G/s from NASA study)
          </span>
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-700">Max allowed G</span>
          <div class="flex items-center gap-2">
            <input
              type="number"
              inputmode="decimal"
              min="1"
              step="1"
              value={props.maxG}
              onInput={(e) => props.onMaxGChange(parseNumberInput(e))}
              class="w-full rounded-md border border-gray-300 px-2 py-1.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span class="text-sm text-gray-500 whitespace-nowrap">G</span>
          </div>
          <span class="text-xs text-gray-500">Peak deceleration cap (e.g. EN 42 G)</span>
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-700">Max time at max G</span>
          <div class="flex items-center gap-2">
            <input
              type="number"
              inputmode="decimal"
              min="0"
              step="0.5"
              value={props.maxGTimeMs}
              onInput={(e) => props.onMaxGTimeMsChange(parseNumberInput(e))}
              class="w-full rounded-md border border-gray-300 px-2 py-1.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span class="text-sm text-gray-500 whitespace-nowrap">ms</span>
          </div>
          <span class="text-xs text-gray-500">Allowable time at the max G plateau (e.g. 7 ms)</span>
        </label>
      </div>

      {props.errorMessage && (
        <div class="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {props.errorMessage}
        </div>
      )}
    </section>
  )
}
