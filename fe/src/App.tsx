import type { Component } from 'solid-js'
import { createMemo, createSignal } from 'solid-js'
import { AccelerationProfileChart } from './components/AccelerationProfileChart'
import { InputPanel } from './components/InputPanel'
import { SummaryPanel } from './components/SummaryPanel'
import { ThicknessPanel } from './components/ThicknessPanel'
import { computeProfile } from './lib/physics'

export const AppUI: Component = () => {
  const [impactSpeed, setImpactSpeed] = createSignal(6) // m/s
  const [jerkG, setJerkG] = createSignal(1300) // G/s
  const [maxG, setMaxG] = createSignal(42) // G

  const result = createMemo(() =>
    computeProfile({
      v0: impactSpeed(),
      jerkG: jerkG(),
      maxG: maxG(),
    }),
  )

  const getProfileShapeDescription = () => {
    const type = result().profileType
    if (type === 'triangular') {
      return 'linear up, linear down (no constant phase)'
    }
    if (type === 'trapezoidal') {
      return 'linear up, constant, linear down'
    }
    return ''
  }

  return (
    <div class="min-h-screen bg-slate-50 text-gray-900">
      <div class="max-w-5xl mx-auto py-8 px-4 space-y-6">
        <header class="space-y-2">
          <h1 class="md:text-3xl text-xl font-bold tracking-tight">
            Paragliding Harness Back Protector Visualizer
          </h1>
          <p class="text-gray-600">
            Visualize jerk and G limited paragliding harness back protectors.
          </p>
          <p class="text-gray-600">
            This is an{' '}
            <a
              href="https://github.com/hyperknot/harnessvis"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-600 hover:underline"
            >
              open source
            </a>{' '}
            project by Zsolt Ero. Physics is in{' '}
            <a
              href="https://github.com/hyperknot/harnessvis/blob/main/fe/src/lib/physics.ts"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-600 hover:underline"
            >
              this file
            </a>
            .
          </p>
        </header>

        {/* Content layout */}
        <div class="space-y-6">
          {/* Full-width chart on top */}
          <section class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
            <div class="space-y-1">
              <h2 class="text-lg font-semibold">Acceleration profile</h2>
              <p class="text-xs text-gray-500">{getProfileShapeDescription()}</p>
            </div>
            <AccelerationProfileChart samples={result().samples} />
          </section>

          {/* Full-width thickness panel */}
          <ThicknessPanel result={result()} />

          {/* Input (left) + summary (right) on desktop */}
          <div class="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start">
            <InputPanel
              impactSpeed={impactSpeed()}
              jerkG={jerkG()}
              maxG={maxG()}
              onImpactSpeedChange={setImpactSpeed}
              onJerkGChange={setJerkG}
              onMaxGChange={setMaxG}
              errorMessage={!result().ok ? result().reason : undefined}
            />

            <SummaryPanel result={result()} />
          </div>
        </div>
      </div>
    </div>
  )
}
