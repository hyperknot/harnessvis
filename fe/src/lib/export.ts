import type { PhysicsResult } from '../types/physics'
import { G_CONST } from '../types/physics'

const SAMPLE_RATE = 10000 // Hz
const DT = 1 / SAMPLE_RATE // seconds per sample

/**
 * Get acceleration (m/s²) at time t for the 3-phase profile
 */
function getAccelAtTime(t: number, result: PhysicsResult): number {
  const { t1, t2, peakA, jerk, totalTime } = result

  if (t < 0 || t > totalTime) return 0

  if (t <= t1) {
    // Phase 1: ramp up
    return jerk * t
  }
  if (t <= t1 + t2) {
    // Phase 2: plateau
    return peakA
  }
  // Phase 3: ramp down
  const sigma = t - t1 - t2
  return Math.max(peakA - jerk * sigma, 0)
}

/**
 * Generate CSV for flat format: starts from 0, positive peak, back to 0
 */
export function generateFlatCSV(result: PhysicsResult): string {
  const lines: string[] = ['time0,accel']
  const numSamples = Math.ceil(result.totalTime * SAMPLE_RATE) + 1

  for (let i = 0; i < numSamples; i++) {
    const t = i * DT
    const accelG = getAccelAtTime(t, result) / G_CONST
    lines.push(`${t},${accelG}`)
  }

  return lines.join('\n')
}

/**
 * Generate CSV for drop format:
 * - 300ms idle at 0 G
 * - Freefall at -1 G (duration based on impact speed: t = v0/g)
 * - Positive peak profile (0 -> peak -> 0)
 * - Final -1 G
 */
export function generateDropCSV(result: PhysicsResult): string {
  const lines: string[] = ['time0,accel']

  // Calculate freefall duration: v = g * t => t = v0 / g
  const freefallDuration = result.v0 / G_CONST
  const idleDuration = 0.3

  let t = 0

  // Phase 1: 300ms idle at 0 G
  const idleSamples = Math.ceil(idleDuration * SAMPLE_RATE)
  for (let i = 0; i < idleSamples; i++) {
    lines.push(`${t},0`)
    t += DT
  }

  // Phase 2: Freefall at -1 G
  const freefallSamples = Math.ceil(freefallDuration * SAMPLE_RATE)
  for (let i = 0; i < freefallSamples; i++) {
    lines.push(`${t},-1`)
    t += DT
  }

  // Phase 3: Positive peak profile (0 -> peak -> 0)
  const profileSamples = Math.ceil(result.totalTime * SAMPLE_RATE) + 1
  for (let i = 0; i < profileSamples; i++) {
    const profileT = i * DT
    const accelG = getAccelAtTime(profileT, result) / G_CONST
    lines.push(`${t},${accelG}`)
    t += DT
  }

  // Phase 4: Final sample at -1 G
  lines.push(`${t},-1`)

  return lines.join('\n')
}

/**
 * Trigger a CSV file download in the browser
 */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
