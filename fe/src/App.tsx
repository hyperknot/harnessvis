import type { Component } from 'solid-js'
import { createMemo, createSignal } from 'solid-js'
import { AccelerationProfileChart } from './components/AccelerationProfileChart'
import { EibandChart } from './components/EibandChart'
import { InputPanel } from './components/InputPanel'
import { ModeSelector } from './components/ModeSelector'
import { StatsPanel } from './components/StatsPanel'
import { SummaryPanel } from './components/SummaryPanel'
import {
  calculateTheoreticalThickness,
  computeMaxImpactSpeed,
  computeMinJerk,
  computePeakG,
  computeProfile,
} from './lib/physics'
import type { CalculationMode } from './types/physics'

export const AppUI: Component = () => {
  // Mode selection
  const [mode, setMode] = createSignal<CalculationMode>('thickness')

  // Mode 1 (thickness) inputs
  const [impactSpeed, setImpactSpeed] = createSignal(5.7) // m/s

  // Mode 2 (speed) inputs
  const [foamThickness, setFoamThickness] = createSignal(15) // cm

  // Common inputs
  const [jerkG, setJerkG] = createSignal(1300) // G/s
  const [maxG, setMaxG] = createSignal(42) // G
  const [compressionFactor, setCompressionFactor] = createSignal(75) // %

  const calc = createMemo(() => {
    const theoreticalThicknessCm = calculateTheoreticalThickness(
      foamThickness(),
      compressionFactor(),
    )
    const targetStopDistance = theoreticalThicknessCm / 100 // cm -> m

    if (mode() === 'thickness') {
      const thicknessResult = computeProfile({
        v0: impactSpeed(),
        jerkG: jerkG(),
        maxG: maxG(),
      })
      return {
        result: thicknessResult,
        maxImpactSpeed: undefined,
        minJerk: undefined,
        peakG: undefined,
      }
    }

    if (mode() === 'speed') {
      const { maxImpactSpeed, result: speedResult } = computeMaxImpactSpeed({
        targetStopDistance,
        jerkG: jerkG(),
        maxG: maxG(),
      })
      return { result: speedResult, maxImpactSpeed, minJerk: undefined, peakG: undefined }
    }

    if (mode() === 'jerk') {
      const { minJerk, result: jerkResult } = computeMinJerk({
        v0: impactSpeed(),
        targetStopDistance,
        maxG: maxG(),
      })
      return { result: jerkResult, maxImpactSpeed: undefined, minJerk, peakG: undefined }
    }

    const { peakG: computedPeakG, result } = computePeakG({
      v0: impactSpeed(),
      targetStopDistance,
      jerkG: jerkG(),
    })
    return { result, maxImpactSpeed: undefined, minJerk: undefined, peakG: computedPeakG }
  })

  const getProfileShapeDescription = () => {
    const type = calc().result.profileType
    if (type === 'triangular') {
      return 'linear up, linear down (no constant phase)'
    }
    if (type === 'trapezoidal') {
      return 'linear up, constant, linear down'
    }
    return ''
  }

  return (
    <div class="min-h-screen bg-slate-50 text-gray-900 overflow-x-hidden">
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

        {/* Mode selector */}
        <ModeSelector mode={mode()} onModeChange={setMode} />

        {/* Content layout */}
        <div class="space-y-3">
          {/* Full-width chart on top */}
          <section class="bg-white rounded-xl shadow-sm border border-gray-200 py-2 px-3 space-y-3">
            <div>
              <h2 class="text-lg font-semibold">Acceleration profile</h2>
              <p class="text-xs text-gray-500">{getProfileShapeDescription()}</p>
            </div>
            <AccelerationProfileChart samples={calc().result.samples} />
          </section>

          {/* Full-width summary panel */}
          <SummaryPanel
            mode={mode()}
            result={calc().result}
            compressionFactor={compressionFactor()}
            maxImpactSpeed={calc().maxImpactSpeed}
            minJerk={calc().minJerk}
            peakG={calc().peakG}
          />

          <div class="grid gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start">
            <InputPanel
              mode={mode()}
              impactSpeed={impactSpeed()}
              foamThickness={foamThickness()}
              jerkG={jerkG()}
              maxG={maxG()}
              compressionFactor={compressionFactor()}
              onImpactSpeedChange={setImpactSpeed}
              onFoamThicknessChange={setFoamThickness}
              onJerkGChange={setJerkG}
              onMaxGChange={setMaxG}
              onCompressionFactorChange={setCompressionFactor}
              errorMessage={!calc().result.ok ? calc().result.reason : undefined}
            />

            <StatsPanel result={calc().result} />
          </div>

          {/* Eiband chart */}
          <section class="bg-white rounded-xl shadow-sm border border-gray-200 py-2 px-3 space-y-3">
            <div>
              <h2 class="text-lg font-semibold">Eiband tolerance chart</h2>
              <p class="text-xs text-gray-500">
                Time spent at or above each G level (log-log scale)
              </p>
            </div>
            <EibandChart peakG={calc().result.peakG} t1={calc().result.t1} t2={calc().result.t2} />
          </section>
        </div>
      </div>
    </div>
  )
}
