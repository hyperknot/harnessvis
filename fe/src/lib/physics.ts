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
 * Large maxG used to approximate "no max G" (triangular jerk-limited optimum).
 */
const VERY_LARGE_MAX_G = 1e9

/**
 * Large jerk used to approximate "instantaneous ramp" (maxG-only optimum).
 */
const VERY_LARGE_JERK_G = 1e9

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
 *
 * Output:
 *  - stopDistance: the required stopping displacement, i.e. required compression stroke (m).
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
 * given an available compression stroke, jerk limit, and max G.
 *
 * Uses binary search to find the v0 that produces the target stroke.
 */
export function computeMaxImpactSpeed(params: {
  targetStroke: number // meters
  jerkG: number
  maxG: number
}): InverseResult {
  const { targetStroke, jerkG, maxG } = params

  // Edge cases
  if (targetStroke <= 0 || jerkG <= 0 || maxG <= 0) {
    return {
      maxImpactSpeed: 0,
      result: computeProfile({ v0: 0.001, jerkG, maxG }),
    }
  }

  // Binary search for v0
  let low = 0.001
  let high = 1

  // Ensure we bracket the solution: stopDistance(low) < target <= stopDistance(high)
  let resultHigh = computeProfile({ v0: high, jerkG, maxG })
  for (let i = 0; i < 60 && resultHigh.ok && resultHigh.stopDistance < targetStroke; i++) {
    high *= 2
    resultHigh = computeProfile({ v0: high, jerkG, maxG })
  }

  if (!resultHigh.ok) {
    return { maxImpactSpeed: 0, result: resultHigh }
  }

  if (resultHigh.stopDistance < targetStroke) {
    return {
      maxImpactSpeed: high,
      result: {
        ...resultHigh,
        ok: false,
        reason:
          'Could not bracket a solution for impact speed (target stroke is too large for current bounds).',
      },
    }
  }

  // Binary search with sufficient iterations for precision
  let result = resultHigh
  for (let i = 0; i < 120; i++) {
    const mid = (low + high) / 2
    result = computeProfile({ v0: mid, jerkG, maxG })

    if (!result.ok) {
      high = mid
      continue
    }

    if (Math.abs(result.stopDistance - targetStroke) < 1e-9) {
      return { maxImpactSpeed: mid, result }
    }

    if (result.stopDistance < targetStroke) {
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
 * Compute the minimum jerk (G/s) required to stop within a given compression stroke,
 * given impact speed and max G limit.
 *
 * Uses binary search to find the jerkG that produces the target stroke.
 */
export function computeMinJerk(params: {
  v0: number // m/s
  targetStroke: number // meters
  maxG: number
}): { minJerk: number; result: PhysicsResult } {
  const { v0, targetStroke, maxG } = params

  // Edge cases
  if (v0 <= 0 || targetStroke <= 0 || maxG <= 0) {
    return {
      minJerk: 0,
      result: computeProfile({ v0: 0.001, jerkG: 1, maxG }),
    }
  }

  // Feasibility check:
  // Even with "infinite jerk" (instant ramp), the best-case stop distance is limited by maxG.
  const bestCase = computeProfile({ v0, jerkG: VERY_LARGE_JERK_G, maxG })
  if (bestCase.ok && targetStroke < bestCase.stopDistance - 1e-9) {
    return {
      minJerk: 0,
      result: {
        ...bestCase,
        ok: false,
        reason:
          `Impossible: available stroke (${(targetStroke * 100).toFixed(2)} cm) is less than the theoretical minimum ` +
          `(${(bestCase.stopDistance * 100).toFixed(2)} cm) even with extremely high jerk, given maxG = ${maxG.toFixed(2)} G.`,
      },
    }
  }

  // We search for the minimum jerk that achieves stopDistance <= targetStroke.
  let low = 1 // G/s - minimum reasonable jerk
  let high = 1

  let resultHigh = computeProfile({ v0, jerkG: high, maxG })
  // If already sufficient at low/high, return immediately.
  if (resultHigh.ok && resultHigh.stopDistance <= targetStroke) {
    return { minJerk: high, result: resultHigh }
  }

  // Increase high until it's sufficient (or we hit a very large ceiling)
  for (let i = 0; i < 60 && resultHigh.ok && resultHigh.stopDistance > targetStroke; i++) {
    high *= 2
    resultHigh = computeProfile({ v0, jerkG: high, maxG })
  }

  if (!resultHigh.ok) {
    return { minJerk: 0, result: resultHigh }
  }

  if (resultHigh.stopDistance > targetStroke) {
    return {
      minJerk: 0,
      result: {
        ...resultHigh,
        ok: false,
        reason:
          'Could not bracket a solution for jerk (target stroke is too small for current bounds).',
      },
    }
  }

  // Binary search in [low, high]
  let result = resultHigh
  for (let i = 0; i < 120; i++) {
    const mid = (low + high) / 2
    result = computeProfile({ v0, jerkG: mid, maxG })

    if (!result.ok) {
      low = mid
      continue
    }

    if (Math.abs(result.stopDistance - targetStroke) < 1e-9) {
      return { minJerk: mid, result }
    }

    // Higher jerk = shorter stop distance
    if (result.stopDistance > targetStroke) {
      low = mid
    } else {
      high = mid
    }
  }

  const finalJerk = (low + high) / 2
  return {
    minJerk: finalJerk,
    result: computeProfile({ v0, jerkG: finalJerk, maxG }),
  }
}

/**
 * Compute the peak G experienced when stopping within a given compression stroke,
 * given impact speed and jerk limit.
 *
 * This finds what maxG would be required/experienced to stop in the given stroke.
 * Uses binary search to find the peak G that produces the target stroke.
 */
export function computePeakG(params: {
  v0: number // m/s
  targetStroke: number // meters
  jerkG: number
}): { peakG: number; result: PhysicsResult } {
  const { v0, targetStroke, jerkG } = params

  // Edge cases
  if (v0 <= 0 || targetStroke <= 0 || jerkG <= 0) {
    return {
      peakG: 0,
      result: computeProfile({ v0: 0.001, jerkG, maxG: 1 }),
    }
  }

  // Feasibility check:
  // With finite jerk, there is a *minimum* stopping distance even if maxG is unlimited.
  const minDistanceProfile = computeProfile({ v0, jerkG, maxG: VERY_LARGE_MAX_G })
  if (minDistanceProfile.ok && targetStroke < minDistanceProfile.stopDistance - 1e-9) {
    return {
      peakG: 0,
      result: {
        ...minDistanceProfile,
        ok: false,
        reason:
          `Impossible: available stroke (${(targetStroke * 100).toFixed(2)} cm) is less than the minimum required ` +
          `(${(minDistanceProfile.stopDistance * 100).toFixed(2)} cm) for v0 = ${v0.toFixed(2)} m/s with jerk limit = ${jerkG.toFixed(0)} G/s. ` +
          'Increase foam stroke (thickness/compression) or allow higher jerk.',
      },
    }
  }

  // Bracket: low maxG => large stop distance, high maxG => smallest stop distance (triangular limit).
  let low = 0.001
  let high = VERY_LARGE_MAX_G

  // If targetStroke is extremely large, low might still not give enough distance; expand downwards.
  let resultLow = computeProfile({ v0, jerkG, maxG: low })
  for (let i = 0; i < 40 && resultLow.ok && resultLow.stopDistance < targetStroke; i++) {
    low /= 2
    if (low < 1e-12) break
    resultLow = computeProfile({ v0, jerkG, maxG: low })
  }

  if (!resultLow.ok) {
    return { peakG: 0, result: resultLow }
  }

  // Now binary search for maxG that yields the target stroke.
  let result = minDistanceProfile
  for (let i = 0; i < 120; i++) {
    const mid = (low + high) / 2
    result = computeProfile({ v0, jerkG, maxG: mid })

    if (!result.ok) {
      low = mid
      continue
    }

    if (Math.abs(result.stopDistance - targetStroke) < 1e-9) {
      return { peakG: result.peakG, result }
    }

    // Higher maxG = shorter stop distance (until the jerk-limited triangular minimum is reached).
    if (result.stopDistance > targetStroke) {
      low = mid
    } else {
      high = mid
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

  const t_enter = thresholdA / jerk
  const tau_exit = (peakA - thresholdA) / jerk
  const t_exit = t1 + t2 + tau_exit

  return t_exit - t_enter
}

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
 */
export function calculateFoamThickness(
  requiredStrokeCm: number,
  compressionFactor: number,
): number {
  if (compressionFactor <= 0) return 0
  return requiredStrokeCm / (compressionFactor / 100)
}

/**
 * Calculate available compression stroke from foam thickness.
 * Inverse of calculateFoamThickness.
 */
export function calculateTheoreticalThickness(
  foamThickness: number,
  compressionFactor: number,
): number {
  if (compressionFactor <= 0) return 0
  return foamThickness * (compressionFactor / 100)
}
