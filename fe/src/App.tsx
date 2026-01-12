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
    const availableStrokeCm = calculateTheoreticalThickness(foamThickness(), compressionFactor())
    const availableStrokeM = availableStrokeCm / 100 // cm -> m

    if (mode() === 'thickness') {
      const thicknessResult = computeProfile({
        v0: impactSpeed(),
        jerkG: jerkG(),
        maxG: maxG(),
      })
      return {
        result: thicknessResult,
        availableStrokeCm,
        maxImpactSpeed: undefined,
        minJerk: undefined,
        peakG: undefined,
      }
    }

    if (mode() === 'speed') {
      const { maxImpactSpeed, result: speedResult } = computeMaxImpactSpeed({
        targetStroke: availableStrokeM,
        jerkG: jerkG(),
        maxG: maxG(),
      })
      return {
        result: speedResult,
        availableStrokeCm,
        maxImpactSpeed,
        minJerk: undefined,
        peakG: undefined,
      }
    }

    if (mode() === 'jerk') {
      const { minJerk, result: jerkResult } = computeMinJerk({
        v0: impactSpeed(),
        targetStroke: availableStrokeM,
        maxG: maxG(),
      })
      return {
        result: jerkResult,
        availableStrokeCm,
        maxImpactSpeed: undefined,
        minJerk,
        peakG: undefined,
      }
    }

    const { peakG: computedPeakG, result } = computePeakG({
      v0: impactSpeed(),
      targetStroke: availableStrokeM,
      jerkG: jerkG(),
    })
    return {
      result,
      availableStrokeCm,
      maxImpactSpeed: undefined,
      minJerk: undefined,
      peakG: computedPeakG,
    }
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
    <div class="h-screen w-screen bg-white text-gray-900 overflow-hidden flex">
      {/* Left side - scrollable main content */}
      <div class="flex-1 h-full overflow-y-auto border-r border-black">
        <div class="p-4 space-y-4">
          {/* Mode selector at very top */}
          <ModeSelector mode={mode()} onModeChange={setMode} />

          {/* Acceleration profile section */}
          <section class="border border-black p-3 space-y-3">
            <div>
              <h2 class="text-lg font-semibold">Acceleration profile</h2>
              <p class="text-xs text-gray-500">{getProfileShapeDescription()}</p>
            </div>
            <AccelerationProfileChart samples={calc().result.samples} />
          </section>

          {/* Eiband chart section - scroll down to see */}
          <section class="border border-black p-3 space-y-3">
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

      {/* Right side - fixed sidebar */}
      <div class="w-80 h-full overflow-y-auto flex-shrink-0">
        <div class="p-4 space-y-4">
          {/* Inputs at top */}
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

          {/* Profile summary below */}
          <SummaryPanel
            mode={mode()}
            result={calc().result}
            compressionFactor={compressionFactor()}
            availableStrokeCm={calc().availableStrokeCm}
            maxImpactSpeed={calc().maxImpactSpeed}
            minJerk={calc().minJerk}
            peakG={calc().peakG}
          />

          <StatsPanel result={calc().result} />
        </div>
      </div>
    </div>
  )
}
