import { G_CONST, type PhysicsInput, type PhysicsResult, type SamplePoint } from '../types/physics'

export function computeProfile(input: PhysicsInput): PhysicsResult {
  const v0 = Math.max(input.v0, 0)
  const jerkG = Math.max(input.jerkG, 0)
  const maxG = Math.max(input.maxG, 0)
  const maxGTime = Math.max(input.maxGTimeMs, 0) / 1000 // s

  const baseResult: PhysicsResult = {
    ok: false,
    reason: undefined,
    profileType: null,
    v0,
    jerkG,
    maxG,
    maxGTimeMs: input.maxGTimeMs,
    jerk: 0,
    peakG: 0,
    peakA: 0,
    t1: 0,
    t2: 0,
    totalTime: 0,
    stopDistance: 0,
    gLimitReached: false,
    timeAtOrAboveLimit: 0,
    gTimeOk: true,
    samples: [],
  }

  if (v0 <= 0) {
    return {
      ...baseResult,
      ok: false,
      reason: 'Impact speed must be > 0 m/s',
    }
  }
  if (jerkG <= 0) {
    return {
      ...baseResult,
      ok: false,
      reason: 'Max jerk must be > 0 G/s',
    }
  }
  if (maxG <= 0) {
    return {
      ...baseResult,
      ok: false,
      reason: 'Max G must be > 0 G',
    }
  }

  const g = G_CONST
  const jerk = jerkG * g // m/s^3
  const A_limit = maxG * g // m/s^2

  // Unconstrained jerk-limited triangular solution
  const A_tri = Math.sqrt(jerk * v0) // m/s^2
  const A_tri_G = A_tri / g

  let profileType: 'triangular' | 'trapezoidal'
  let peakA: number
  let t1: number
  let t2: number

  const EPS = 1e-12

  if (A_tri <= A_limit + EPS) {
    // Triangular profile: jerk limit active, G limit inactive
    profileType = 'triangular'
    peakA = A_tri
    t1 = peakA / jerk
    t2 = 0
  } else {
    // Trapezoidal profile: jerk limit + max G limit (saturates at maxG)
    profileType = 'trapezoidal'
    peakA = A_limit
    t1 = peakA / jerk
    // From v0 = A^2 / j + A * t2  -> solve for t2
    t2 = (v0 - (peakA * peakA) / jerk) / peakA
    if (t2 < 0) t2 = 0
  }

  const totalTime = 2 * t1 + t2
  const peakG = peakA / g

  // Distances
  const v1 = v0 - 0.5 * jerk * t1 * t1
  const s1 = v0 * t1 - (jerk * t1 * t1 * t1) / 6
  const s2 = v1 * t2 - 0.5 * peakA * t2 * t2
  const s3 = (jerk * t1 * t1 * t1) / 6
  const stopDistance = s1 + s2 + s3

  // Time at or above maxG (for this 3-stage profile, that's the plateau only)
  const gLimitReached = profileType === 'trapezoidal'
  const timeAtOrAboveLimit = gLimitReached ? t2 : 0
  const gTimeOk = timeAtOrAboveLimit <= maxGTime + EPS

  // Build time series samples for chart
  const samples: Array<SamplePoint> = []
  const N = 300

  if (totalTime > 0) {
    const dt = totalTime / (N - 1)
    const s1End = s1
    const v2 = v1 - peakA * t2
    const s2End = s1End + s2

    for (let i = 0; i < N; i++) {
      const t = i * dt
      let a = 0
      let v = 0
      let x = 0

      if (t <= t1 + EPS) {
        // Segment 1: ramp up
        a = jerk * t
        v = v0 - 0.5 * jerk * t * t
        x = v0 * t - (jerk * t * t * t) / 6
      } else if (t <= t1 + t2 + EPS) {
        // Segment 2: constant acceleration
        const tau = t - t1
        a = peakA
        v = v1 - peakA * tau
        x = s1End + v1 * tau - 0.5 * peakA * tau * tau
      } else {
        // Segment 3: ramp down
        const sigma = t - t1 - t2
        a = Math.max(peakA - jerk * sigma, 0)
        v = v2 - peakA * sigma + 0.5 * jerk * sigma * sigma
        x = s2End + v2 * sigma - 0.5 * peakA * sigma * sigma + (jerk * sigma * sigma * sigma) / 6
        if (i === N - 1) {
          // Clamp the very last point to avoid tiny numerical residue
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
  }

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
    timeAtOrAboveLimit,
    gTimeOk,
    samples,
  }
}

export function calculateFoamThickness(
  minTheoreticalThickness: number,
  compressionFactor: number,
): number {
  return minTheoreticalThickness * (1 + compressionFactor / 100)
}
