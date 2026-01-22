import type { Component } from 'solid-js'
import { createEffect, createMemo, createSignal, onMount } from 'solid-js'
import { AccelerationProfileChart } from './components/AccelerationProfileChart'
import { EibandChart } from './components/EibandChart'
import { InputPanel } from './components/InputPanel'
import { ModeSelector } from './components/ModeSelector'
import { StatsPanel } from './components/StatsPanel'
import { SummaryPanel } from './components/SummaryPanel'
import { downloadCSV, generateDropCSV, generateFlatCSV } from './lib/export'
import {
  calculateTheoreticalThickness,
  computeMaxImpactSpeed,
  computeMinJerk,
  computePeakG,
  computeProfile,
} from './lib/physics'
import type { CalculationMode } from './types/physics'

const DEFAULTS = {
  mode: 'thickness' as CalculationMode,
  impactSpeed: 5.7,
  foamThickness: 15,
  jerkG: 1300,
  maxG: 42,
  compressionFactor: 75,
}

interface AppState {
  mode: CalculationMode
  impactSpeed: number
  foamThickness: number
  jerkG: number
  maxG: number
  compressionFactor: number
}

function parseHash(): Partial<AppState> {
  const hash = window.location.hash.slice(1)
  if (!hash) return {}

  const params = new URLSearchParams(hash)
  const state: Partial<AppState> = {}

  const modeParam = params.get('m')
  if (modeParam && ['thickness', 'speed', 'jerk', 'peakG'].includes(modeParam)) {
    state.mode = modeParam as CalculationMode
  }

  const v = params.get('v')
  if (v) state.impactSpeed = Number.parseFloat(v)

  const t = params.get('t')
  if (t) state.foamThickness = Number.parseFloat(t)

  const j = params.get('j')
  if (j) state.jerkG = Number.parseFloat(j)

  const g = params.get('g')
  if (g) state.maxG = Number.parseFloat(g)

  const c = params.get('c')
  if (c) state.compressionFactor = Number.parseFloat(c)

  return state
}

function buildHash(state: AppState): string {
  const params = new URLSearchParams()

  if (state.mode !== DEFAULTS.mode) params.set('m', state.mode)
  if (state.impactSpeed !== DEFAULTS.impactSpeed) params.set('v', String(state.impactSpeed))
  if (state.foamThickness !== DEFAULTS.foamThickness) params.set('t', String(state.foamThickness))
  if (state.jerkG !== DEFAULTS.jerkG) params.set('j', String(state.jerkG))
  if (state.maxG !== DEFAULTS.maxG) params.set('g', String(state.maxG))
  if (state.compressionFactor !== DEFAULTS.compressionFactor) params.set('c', String(state.compressionFactor))

  const str = params.toString()
  return str ? `#${str}` : ''
}

export const AppUI: Component = () => {
  const initialState = parseHash()

  // Mode selection
  const [mode, setMode] = createSignal<CalculationMode>(initialState.mode ?? DEFAULTS.mode)

  // Mode 1 (thickness) inputs
  const [impactSpeed, setImpactSpeed] = createSignal(initialState.impactSpeed ?? DEFAULTS.impactSpeed)

  // Mode 2 (speed) inputs
  const [foamThickness, setFoamThickness] = createSignal(initialState.foamThickness ?? DEFAULTS.foamThickness)

  // Common inputs
  const [jerkG, setJerkG] = createSignal(initialState.jerkG ?? DEFAULTS.jerkG)
  const [maxG, setMaxG] = createSignal(initialState.maxG ?? DEFAULTS.maxG)
  const [compressionFactor, setCompressionFactor] = createSignal(
    initialState.compressionFactor ?? DEFAULTS.compressionFactor
  )

  // Sync state to URL hash
  createEffect(() => {
    const hash = buildHash({
      mode: mode(),
      impactSpeed: impactSpeed(),
      foamThickness: foamThickness(),
      jerkG: jerkG(),
      maxG: maxG(),
      compressionFactor: compressionFactor(),
    })
    window.history.replaceState(null, '', hash || window.location.pathname)
  })

  // Handle browser back/forward navigation
  onMount(() => {
    const handleHashChange = () => {
      const newState = parseHash()
      if (newState.mode !== undefined) setMode(newState.mode)
      if (newState.impactSpeed !== undefined) setImpactSpeed(newState.impactSpeed)
      if (newState.foamThickness !== undefined) setFoamThickness(newState.foamThickness)
      if (newState.jerkG !== undefined) setJerkG(newState.jerkG)
      if (newState.maxG !== undefined) setMaxG(newState.maxG)
      if (newState.compressionFactor !== undefined) setCompressionFactor(newState.compressionFactor)
    }
    window.addEventListener('hashchange', handleHashChange)
  })

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
        {/* Mode selector - sticky at top */}
        <div class="sticky top-0 z-10 bg-white border-b border-black">
          <ModeSelector mode={mode()} onModeChange={setMode} />
        </div>

        {/* Acceleration profile section */}
        <section class="p-4 border-b border-black">
          <div class="mb-2">
            <h2 class="text-lg font-semibold">Acceleration profile</h2>
            <p class="text-xs text-gray-500">{getProfileShapeDescription()}</p>
          </div>
          <AccelerationProfileChart samples={calc().result.samples} />
        </section>

        {/* Eiband chart section */}
        <section class="p-4">
          <div class="mb-2">
            <h2 class="text-lg font-semibold">Eiband chart</h2>
            <p class="text-xs text-gray-500">Time spent at or above each G level (log-log scale)</p>
          </div>
          <EibandChart peakG={calc().result.peakG} t1={calc().result.t1} t2={calc().result.t2} />
        </section>
      </div>

      {/* Right side - scrollable sidebar */}
      <div class="w-80 h-full overflow-y-auto flex-shrink-0">
        {/* About section */}
        <div class="p-3 border-b border-black">
          <h1 class="font-semibold">Paragliding Harness Back Protector Visualizer</h1>
          <p class="text-xs text-gray-600 mt-0.5">
            <a
              href="https://github.com/hyperknot/harnessvis"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-600 hover:underline"
            >
              Open source
            </a>
            {' project by Zsolt Ero. '}
            <a
              href="https://github.com/hyperknot/harnessvis/blob/main/fe/src/lib/physics.ts"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-600 hover:underline"
            >
              Physics
            </a>
          </p>
        </div>

        {/* Inputs */}
        <div class="border-b border-black">
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
        </div>

        {/* Summary */}
        <div class="border-b border-black">
          <SummaryPanel
            mode={mode()}
            result={calc().result}
            compressionFactor={compressionFactor()}
            availableStrokeCm={calc().availableStrokeCm}
            maxImpactSpeed={calc().maxImpactSpeed}
            minJerk={calc().minJerk}
            peakG={calc().peakG}
          />
        </div>

        {/* Stats */}
        <StatsPanel result={calc().result} />

        {/* Export buttons */}
        <div class="p-3 border-t border-black">
          <h3 class="text-sm font-semibold mb-2">Export drop test</h3>
          <div class="flex gap-2">
            <button
              type="button"
              class="flex-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!calc().result.ok}
              onClick={() => {
                if (calc().result.ok) {
                  const r = calc().result
                  const csv = generateFlatCSV(r)
                  const filename = `${r.v0.toFixed(1)}-${Math.round(r.peakG)}-${Math.round(r.jerkG)}.csv`
                  downloadCSV(csv, filename)
                }
              }}
            >
              Flat CSV
            </button>
            <button
              type="button"
              class="flex-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!calc().result.ok}
              onClick={() => {
                if (calc().result.ok) {
                  const r = calc().result
                  const csv = generateDropCSV(r)
                  const filename = `${r.v0.toFixed(1)}-${Math.round(r.peakG)}-${Math.round(r.jerkG)}.csv`
                  downloadCSV(csv, filename)
                }
              }}
            >
              Drop CSV
            </button>
          </div>
          <p class="text-xs text-gray-500 mt-2">10 kHz sampling rate</p>
        </div>
      </div>
    </div>
  )
}
