import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import type { CalculationMode } from '../types/physics'

// Reusable number input component
const NumberInput: Component<{
  label: string
  value: number
  unit: string
  hint: string
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
}> = (props) => {
  const parse = (e: Event & { currentTarget: HTMLInputElement }) => {
    const v = Number.parseFloat(e.currentTarget.value)
    return Number.isFinite(v) ? v : 0
  }

  return (
    <label class="flex flex-col gap-1">
      <span class="font-medium text-gray-700">{props.label}</span>
      <div class="flex items-center gap-2">
        <input
          type="number"
          inputmode="decimal"
          min={props.min ?? 0}
          max={props.max}
          step={props.step ?? 1}
          value={props.value}
          onInput={(e) => props.onChange(parse(e))}
          class="w-full border border-neutral-500 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
        />
        <span class="text-gray-500 whitespace-nowrap">{props.unit}</span>
      </div>
      <span class="text-xs text-gray-500">{props.hint}</span>
    </label>
  )
}

interface InputPanelProps {
  mode: CalculationMode
  impactSpeed: number
  foamThickness: number
  jerkG: number
  maxG: number
  compressionFactor: number
  onImpactSpeedChange: (value: number) => void
  onFoamThicknessChange: (value: number) => void
  onJerkGChange: (value: number) => void
  onMaxGChange: (value: number) => void
  onCompressionFactorChange: (value: number) => void
  errorMessage?: string
}

export const InputPanel: Component<InputPanelProps> = (props) => {
  const showImpactSpeed = () => props.mode !== 'speed'
  const showFoamThickness = () => props.mode !== 'thickness'
  const showJerk = () => props.mode !== 'jerk'
  const showMaxG = () => props.mode !== 'peakG'

  return (
    <section class="p-4 space-y-4">
      <h2 class="text-lg font-semibold">Inputs</h2>

      <div class="grid gap-4 text-sm">
        <Show when={showImpactSpeed()}>
          <NumberInput
            label="Impact speed"
            value={props.impactSpeed}
            unit="m/s"
            hint="Vertical speed at impact (e.g. 5.7 m/s = EN drop test)"
            step={0.1}
            onChange={props.onImpactSpeedChange}
          />
        </Show>

        <Show when={showFoamThickness()}>
          <NumberInput
            label="Foam thickness"
            value={props.foamThickness}
            unit="cm"
            hint="Uncompressed foam protector thickness"
            step={0.5}
            onChange={props.onFoamThicknessChange}
          />
        </Show>

        <Show when={showJerk()}>
          <NumberInput
            label="Max jerk"
            value={props.jerkG}
            unit="G/s"
            hint="Rate of onset limit (e.g. 1300 G/s from NASA study)"
            step={50}
            onChange={props.onJerkGChange}
          />
        </Show>

        <Show when={showMaxG()}>
          <NumberInput
            label="Max allowed G"
            value={props.maxG}
            unit="G"
            hint="Peak deceleration cap (e.g. EN 42 G)"
            min={1}
            step={1}
            onChange={props.onMaxGChange}
          />
        </Show>

        <NumberInput
          label="Max foam compression"
          value={props.compressionFactor}
          unit="%"
          hint="Foam thickness to compression stroke (before bottoming out)"
          min={1}
          max={99}
          step={1}
          onChange={props.onCompressionFactorChange}
        />
      </div>

      {props.errorMessage && (
        <div class="mt-2 border border-neutral-500 bg-red-200 px-3 py-2 text-xs text-red-950">
          {props.errorMessage}
        </div>
      )}
    </section>
  )
}
