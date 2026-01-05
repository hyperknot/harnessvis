import type { Component } from 'solid-js'
import { createSignal } from 'solid-js'
import { GraphDigitizer } from './components/GraphDigitizer'

type AppMode = 'digitizer' | 'visualizer'

export const AppUI: Component = () => {
  const [appMode, setAppMode] = createSignal<AppMode>('digitizer')

  return (
    <div>
      {/* Mode selector */}
      <div class="bg-slate-800 text-white p-2">
        <div class="max-w-7xl mx-auto flex gap-4 items-center">
          <span class="font-semibold">Mode:</span>
          <button
            class="px-3 py-1 rounded"
            classList={{
              'bg-blue-600': appMode() === 'digitizer',
              'bg-slate-600 hover:bg-slate-500': appMode() !== 'digitizer',
            }}
            onClick={() => setAppMode('digitizer')}
          >
            Graph Digitizer
          </button>
          <button
            class="px-3 py-1 rounded"
            classList={{
              'bg-blue-600': appMode() === 'visualizer',
              'bg-slate-600 hover:bg-slate-500': appMode() !== 'visualizer',
            }}
            onClick={() => setAppMode('visualizer')}
          >
            Harness Visualizer
          </button>
        </div>
      </div>

      <GraphDigitizer />
    </div>
  )
}
