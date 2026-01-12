import {
  G_CONST,
  type InverseResult,
  type PhysicsInput,
  type PhysicsResult,
  type ProfileType,
  type SamplePoint,
} from '../types/physics'

/**
 * Small numeric epsilon used for floating‑point comparisons.
 */
const EPSILON = 1e-12

/**
 * Number of samples used to discretise the profile for plotting.
 */
const SAMPLE_COUNT = 300

/**
 * Compute a 3‑phase, jerk‑limited deceleration profile:
 *  - ramp up with +jerk (0 → peakG)
 *  - optional plateau at peakG
 *  - ramp down with −jerk (peakG → 0)
 *
 * The solver respects:
 *  - impact speed (v0)
 *  - jerk limit (jerkG, in G/s)
 *  - peak G limit (maxG)
 */
export function computeProfile(input: PhysicsInput): PhysicsResult {
  // Clamp inputs to non‑negative values
  const v0 = Math.max(input.v0, 0)
  const jerkG = Math.max(input.jerkG, 0)
  const maxG = Math.max(input.maxG, 0)

  const baseResult: PhysicsResult = {
    ok: false,
    reason: undefined,
    profileType: null,
    v0,
    jerkG,
    maxG,
    jerk: 0,
    peakG: 0,
    peakA: 0,
    t1: 0,
    t2: 0,
    totalTime: 0,
    stopDistance: 0,
    gLimitReached: false,
    timeOver38G: 0,
    timeOver20G: 0,
    samples: [],
  }

  const makeError = (reason: string): PhysicsResult => ({
    ...baseResult,
    ok: false,
    reason,
  })

  // Basic validation
  if (v0 <= 0) return makeError('Impact speed must be > 0 m/s')
  if (jerkG <= 0) return makeError('Max jerk must be > 0 G/s')
  if (maxG <= 0) return makeError('Max G must be > 0 G')

  const g = G_CONST

  // Convert jerk from G/s to SI (m/s^3)
  const jerk = jerkG * g

  // Peak acceleration limit in SI (m/s^2)
  const aLimit = maxG * g

  // Unconstrained jerk‑limited triangular peak:
  const aTri = Math.sqrt(jerk * v0)

  let profileType: ProfileType
  let peakA: number // peak acceleration (m/s^2)
  let t1: number // ramp‑up time
  let t2: number // plateau duration

  // Decide if the G limit is active or not
  if (aTri <= aLimit + EPSILON) {
    // Triangular profile: jerk limit active, maxG not reached
    profileType = 'triangular'
    peakA = aTri
    t1 = peakA / jerk
    t2 = 0
  } else {
    // Trapezoidal profile: jerk limit + maxG plateau
    profileType = 'trapezoidal'
    peakA = aLimit
    t1 = peakA / jerk
    // From v0 = A^2 / j + A * t2  → solve for t2
    t2 = (v0 - (peakA * peakA) / jerk) / peakA
    if (t2 < 0) t2 = 0
  }

  const totalTime = 2 * t1 + t2
  const peakG = peakA / g

  // Distances and velocities for each phase
  //
  // Phase 1 (ramp up, 0 → t1):
  //   a(t) =  j * t
  //   v(t) = v0 - 0.5 * j * t^2
  //   x(t) = v0 * t - (j * t^3) / 6
  const v1 = v0 - 0.5 * jerk * t1 * t1
  const s1 = v0 * t1 - (jerk * t1 * t1 * t1) / 6

  // Phase 2 (plateau, if any, t1 → t1 + t2):
  //   a(t) = A
  //   v(t) = v1 - A * τ
  //   x(t) = s1 + v1 * τ - 0.5 * A * τ^2
  const s2 = v1 * t2 - 0.5 * peakA * t2 * t2

  // Phase 3 (ramp down, t1 + t2 → totalTime):
  //   symmetric to phase 1 in distance:
  //   s3 = (j * t1^3) / 6
  const s3 = (jerk * t1 * t1 * t1) / 6

  const stopDistance = s1 + s2 + s3

  const gLimitReached = profileType === 'trapezoidal'

  // Build time‑series samples for charting
  const samples = buildSamples({
    v0,
    jerk,
    peakA,
    t1,
    t2,
    totalTime,
    s1,
    s2,
    g,
  })

  // Calculate exact time spent over 38G and 20G using analytical formulas
  const { timeOver38G, timeOver20G } = calculateExactTimeOverThresholds(peakA, jerk, t1, t2, g)

  return {
    ...baseResult,
    ok: true,
    reason: undefined,
    profileType,
    jerk,
    peakG,
    peakA,
    t1,
    t2,
    totalTime,
    stopDistance,
    gLimitReached,
    timeOver38G,
    timeOver20G,
    samples,
  }
}

/**
 * Compute the maximum impact speed that can be safely absorbed
 * given a target stop distance (theoretical thickness), jerk limit, and max G.
 *
 * Uses binary search to find the v0 that produces the target stopDistance.
 */
export function computeMaxImpactSpeed(params: {
  targetStopDistance: number // meters
  jerkG: number
  maxG: number
}): InverseResult {
  const { targetStopDistance, jerkG, maxG } = params

  // Edge cases
  if (targetStopDistance <= 0 || jerkG <= 0 || maxG <= 0) {
    return {
      maxImpactSpeed: 0,
      result: computeProfile({ v0: 0.001, jerkG, maxG }),
    }
  }

  // Binary search for v0
  let low = 0.001
  let high = 100 // m/s - generous upper bound

  // Expand upper bound if needed
  let result = computeProfile({ v0: high, jerkG, maxG })
  while (result.ok && result.stopDistance < targetStopDistance && high < 1000) {
    high *= 2
    result = computeProfile({ v0: high, jerkG, maxG })
  }

  // Binary search with sufficient iterations for precision
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2
    result = computeProfile({ v0: mid, jerkG, maxG })

    if (!result.ok) {
      high = mid
      continue
    }

    if (Math.abs(result.stopDistance - targetStopDistance) < 1e-9) {
      return { maxImpactSpeed: mid, result }
    }

    if (result.stopDistance < targetStopDistance) {
      low = mid
    } else {
      high = mid
    }
  }

  const finalV0 = (low + high) / 2
  return {
    maxImpactSpeed: finalV0,
    result: computeProfile({ v0: finalV0, jerkG, maxG }),
  }
}

/**
 * Compute the minimum jerk (G/s) required to stop within a given distance,
 * given impact speed and max G limit.
 *
 * Uses binary search to find the jerkG that produces the target stopDistance.
 */
export function computeMinJerk(params: {
  v0: number // m/s
  targetStopDistance: number // meters
  maxG: number
}): { minJerk: number; result: PhysicsResult } {
  const { v0, targetStopDistance, maxG } = params

  // Edge cases
  if (v0 <= 0 || targetStopDistance <= 0 || maxG <= 0) {
    return {
      minJerk: 0,
      result: computeProfile({ v0: 0.001, jerkG: 1, maxG }),
    }
  }

  // Binary search for jerkG
  // Higher jerk = faster ramp up = shorter stopping distance
  // So we search for the minimum jerk that achieves target distance
  let low = 1 // G/s - minimum reasonable jerk
  let high = 100000 // G/s - generous upper bound

  // Binary search with sufficient iterations for precision
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2
    const result = computeProfile({ v0, jerkG: mid, maxG })

    if (!result.ok) {
      low = mid
      continue
    }

    if (Math.abs(result.stopDistance - targetStopDistance) < 1e-9) {
      return { minJerk: mid, result }
    }

    // Higher jerk = shorter stop distance
    if (result.stopDistance > targetStopDistance) {
      low = mid // need more jerk to stop in less distance
    } else {
      high = mid // can use less jerk
    }
  }

  const finalJerk = (low + high) / 2
  return {
    minJerk: finalJerk,
    result: computeProfile({ v0, jerkG: finalJerk, maxG }),
  }
}

/**
 * Compute the peak G experienced when stopping within a given distance,
 * given impact speed and jerk limit.
 *
 * This finds what maxG would be required/experienced to stop in the given distance.
 * Uses binary search to find the peak G that produces the target stopDistance.
 */
export function computePeakG(params: {
  v0: number // m/s
  targetStopDistance: number // meters
  jerkG: number
}): { peakG: number; result: PhysicsResult } {
  const { v0, targetStopDistance, jerkG } = params

  // Edge cases
  if (v0 <= 0 || targetStopDistance <= 0 || jerkG <= 0) {
    return {
      peakG: 0,
      result: computeProfile({ v0: 0.001, jerkG, maxG: 1 }),
    }
  }

  // Binary search for maxG
  // Lower maxG limit = longer plateau needed = longer stop distance
  // Higher maxG limit = can stop faster
  let low = 0.1 // G - minimum
  let high = 1000 // G - generous upper bound

  // Binary search with sufficient iterations for precision
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2
    const result = computeProfile({ v0, jerkG, maxG: mid })

    if (!result.ok) {
      low = mid
      continue
    }

    if (Math.abs(result.stopDistance - targetStopDistance) < 1e-9) {
      return { peakG: result.peakG, result }
    }

    // Higher maxG = shorter stop distance
    if (result.stopDistance > targetStopDistance) {
      low = mid // need higher G to stop in less distance
    } else {
      high = mid // can use lower G
    }
  }

  const finalMaxG = (low + high) / 2
  const finalResult = computeProfile({ v0, jerkG, maxG: finalMaxG })
  return {
    peakG: finalResult.peakG,
    result: finalResult,
  }
}

/**
 * Helper to generate SamplePoint[] for the 3‑phase profile.
 */
function buildSamples(params: {
  v0: number
  jerk: number
  peakA: number
  t1: number
  t2: number
  totalTime: number
  s1: number
  s2: number
  g: number
}): Array<SamplePoint> {
  const { v0, jerk, peakA, t1, t2, totalTime, s1, s2, g } = params

  const samples: Array<SamplePoint> = []

  if (totalTime <= 0) return samples

  const dt = totalTime / (SAMPLE_COUNT - 1)

  const s1End = s1
  const v1 = v0 - 0.5 * jerk * t1 * t1
  const v2 = v1 - peakA * t2
  const s2End = s1End + s2

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const t = i * dt
    let a = 0
    let v = 0
    let x = 0

    if (t <= t1 + EPSILON) {
      // Phase 1: ramp up
      a = jerk * t
      v = v0 - 0.5 * jerk * t * t
      x = v0 * t - (jerk * t * t * t) / 6
    } else if (t <= t1 + t2 + EPSILON) {
      // Phase 2: constant acceleration (plateau)
      const tau = t - t1
      a = peakA
      v = v1 - peakA * tau
      x = s1End + v1 * tau - 0.5 * peakA * tau * tau
    } else {
      // Phase 3: ramp down
      const sigma = t - t1 - t2
      a = Math.max(peakA - jerk * sigma, 0)
      v = v2 - peakA * sigma + 0.5 * jerk * sigma * sigma
      x = s2End + v2 * sigma - 0.5 * peakA * sigma * sigma + (jerk * sigma * sigma * sigma) / 6

      if (i === SAMPLE_COUNT - 1) {
        // Clamp the very last point to avoid small numerical residue
        v = 0
        a = 0
      }
    }

    samples.push({
      t,
      aG: a / g,
      v,
      x,
    })
  }

  return samples
}

/**
 * Calculate exact time spent over a given G threshold using analytical formulas.
 *
 * For a jerk-limited profile with three phases:
 * - Phase 1 (0 → t₁): linear ramp-up, a(t) = j·t
 * - Phase 2 (t₁ → t₁+t₂): constant acceleration (plateau) if present, a(t) = A_peak
 * - Phase 3 (t₁+t₂ → 2t₁+t₂): linear ramp-down, a(t) = A_peak - j·(t - t₁ - t₂)
 *
 * The time over threshold is the interval [t_enter, t_exit] where:
 * - t_enter: when acceleration reaches threshold during ramp-up
 * - t_exit: when acceleration drops below threshold during ramp-down
 *
 * Derivation:
 * - Phase 1: a(t) = j·t = A_threshold → t_enter = A_threshold / j
 * - Phase 3: a(τ) = A_peak - j·τ = A_threshold → τ_exit = (A_peak - A_threshold) / j
 * - Convert to absolute time: t_exit = t₁ + t₂ + τ_exit
 * - Time over threshold: t_exit - t_enter
 */
function calculateExactTimeOverThreshold(
  thresholdG: number,
  peakA: number, // m/s^2
  jerk: number, // m/s^3
  t1: number, // ramp time (s)
  t2: number, // plateau time (s)
  g: number, // gravity constant (m/s^2)
): number {
  const peakG = peakA / g

  // If peak acceleration is at or below threshold, no time is spent over it
  if (peakG <= thresholdG + EPSILON) {
    return 0
  }

  const thresholdA = thresholdG * g // threshold in m/s^2

  // Find when acceleration reaches threshold during ramp-up (phase 1)
  // Phase 1: a(t) = j·t, solve for a(t) = thresholdA
  const t_enter = thresholdA / jerk

  // Find when acceleration drops below threshold during ramp-down (phase 3)
  // Phase 3: a(τ) = peakA - j·τ, solve for a(τ) = thresholdA
  // where τ is time since start of phase 3
  const tau_exit = (peakA - thresholdA) / jerk

  // Convert to absolute time
  const t_exit = t1 + t2 + tau_exit

  // Total time over threshold
  return t_exit - t_enter
}

/**
 * Calculate exact time spent over 38G and 20G thresholds using analytical formulas
 * instead of sample-based approximations.
 */
function calculateExactTimeOverThresholds(
  peakA: number,
  jerk: number,
  t1: number,
  t2: number,
  g: number,
): { timeOver38G: number; timeOver20G: number } {
  return {
    timeOver38G: calculateExactTimeOverThreshold(38, peakA, jerk, t1, t2, g),
    timeOver20G: calculateExactTimeOverThreshold(20, peakA, jerk, t1, t2, g),
  }
}

/**
 * Calculate required uncompressed foam thickness based on max compression percentage.
 *
 * Example: Need 10 cm compression, foam compresses 70%
 *   → Required thickness = 10 / 0.70 = 14.29 cm
 *   → When compressed 70%, goes from 14.29 to 4.29 cm (compressed 10 cm)
 *
 * @param minTheoreticalThickness - Required compression distance (cm)
 * @param compressionFactor - Max compression percentage (e.g., 70 means foam can compress to 30% of original)
 */
export function calculateFoamThickness(
  minTheoreticalThickness: number,
  compressionFactor: number,
): number {
  if (compressionFactor <= 0) return 0
  return minTheoreticalThickness / (compressionFactor / 100)
}

/**
 * Calculate theoretical compression distance from foam thickness.
 * Inverse of calculateFoamThickness.
 *
 * @param foamThickness - Uncompressed foam thickness (cm)
 * @param compressionFactor - Max compression percentage
 */
export function calculateTheoreticalThickness(
  foamThickness: number,
  compressionFactor: number,
): number {
  if (compressionFactor <= 0) return 0
  return foamThickness * (compressionFactor / 100)
}
