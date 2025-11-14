import type { Component } from 'solid-js'
import { createMemo, createSignal } from 'solid-js'
import { AccelerationProfileChart } from './components/AccelerationProfileChart'
import { InputPanel } from './components/InputPanel'
import { SummaryPanel } from './components/SummaryPanel'
import { computeProfile } from './utils/physics'

export const AppUI: Component = () => {
  const [impactSpeed, setImpactSpeed] = createSignal(6) // m/s
  const [jerkG, setJerkG] = createSignal(1300) // G/s
  const [maxG, setMaxG] = createSignal(35) // G
  const [maxGTimeMs, setMaxGTimeMs] = createSignal(7) // ms

  const result = createMemo(() =>
    computeProfile({
      v0: impactSpeed(),
      jerkG: jerkG(),
      maxG: maxG(),
      maxGTimeMs: maxGTimeMs(),
    }),
  )

  const getProfileShapeDescription = () => {
    const type = result().profileType
    if (type === 'triangular') {
      return 'Shape: linear up, linear down (no constant phase)'
    }
    if (type === 'trapezoidal') {
      return 'Shape: linear up, constant, linear down'
    }
    return 'Shape: —'
  }

  return (
    <div class="min-h-screen bg-slate-50 text-gray-900">
      <div class="max-w-5xl mx-auto py-8 px-4 space-y-6">
        <header class="space-y-2">
          <h1 class="text-3xl font-bold tracking-tight">Jerk-limited Harness Impact Visualizer</h1>
          <p class="text-gray-600">
            Explore 3-stage deceleration profiles (linear up, constant, linear down) with limits on
            jerk and peak G.
          </p>
          <p class="text-sm text-gray-600">
            <strong>Open source.</strong> Source code on{' '}
            <a
              href="https://github.com/hyperknot/harnessvis"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-600 hover:underline"
            >
              GitHub
            </a>
            . Physics verified in{' '}
            <a
              href="https://github.com/hyperknot/harnessvis/blob/main/fe/src/utils/physics.ts"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-600 hover:underline"
            >
              physics.ts
            </a>
            .
          </p>
        </header>

        <div class="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start">
          <InputPanel
            impactSpeed={impactSpeed()}
            jerkG={jerkG()}
            maxG={maxG()}
            maxGTimeMs={maxGTimeMs()}
            onImpactSpeedChange={setImpactSpeed}
            onJerkGChange={setJerkG}
            onMaxGChange={setMaxG}
            onMaxGTimeMsChange={setMaxGTimeMs}
            errorMessage={!result().ok ? result().reason : undefined}
          />

          <section class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3 order-3 md:order-2">
            <div class="space-y-1">
              <h2 class="text-lg font-semibold">Acceleration profile</h2>
              <p class="text-xs text-gray-500">{getProfileShapeDescription()}</p>
            </div>
            <AccelerationProfileChart samples={result().samples} />
          </section>

          <SummaryPanel result={result()} class="order-2 md:order-3" />
        </div>
      </div>
    </div>
  )
}
