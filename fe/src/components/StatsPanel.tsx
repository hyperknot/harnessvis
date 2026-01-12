import type { Component } from 'solid-js'
import type { PhysicsResult } from '../types/physics'

// Reusable stat row component
const StatRow: Component<{
  label: string
  value: string
  warning?: boolean
}> = (props) => (
  <div class="flex justify-between">
    <span class="text-gray-600">{props.label}</span>
    <span class="font-semibold" classList={{ 'text-red-600': props.warning }}>
      {props.value}
    </span>
  </div>
)

interface StatsPanelProps {
  result: PhysicsResult
  class?: string
}

export const StatsPanel: Component<StatsPanelProps> = (props) => {
  const isOver38GLimit = () => props.result.timeOver38G >= 0.007
  const isOver20GLimit = () => props.result.timeOver20G >= 0.025
  const isOverAnyLimit = () => isOver38GLimit() || isOver20GLimit()

  const formatMs = (seconds: number | undefined, fallback = '—') =>
    seconds ? `${(seconds * 1000).toFixed(2)} ms` : fallback

  return (
    <section class="p-4 space-y-4" classList={{ [props.class || '']: Boolean(props.class) }}>
      <h2 class="text-lg font-semibold">Profile timing</h2>

      <div class="grid gap-2 text-sm">
        <StatRow label="Time to peak G:" value={formatMs(props.result.t1)} />
        <StatRow label="Constant-G phase:" value={formatMs(props.result.t2, '0.00 ms')} />
        <StatRow label="Total stop time:" value={formatMs(props.result.totalTime)} />

        <div class="pt-2 border-t border-neutral-400 mt-2 space-y-2">
          <StatRow
            label="Time over 38 G:"
            value={formatMs(props.result.timeOver38G, '0.00 ms')}
            warning={isOver38GLimit()}
          />
          <StatRow
            label="Time over 20 G:"
            value={formatMs(props.result.timeOver20G, '0.00 ms')}
            warning={isOver20GLimit()}
          />
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
