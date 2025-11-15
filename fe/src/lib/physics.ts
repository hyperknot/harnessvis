import {
  G_CONST,
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

  // Calculate time spent over 38G and 20G
  const { timeOver38G, timeOver20G } = calculateTimeOverThresholds(samples, totalTime)

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
 * Calculate time spent over 38G and 20G thresholds
 */
function calculateTimeOverThresholds(
  samples: Array<SamplePoint>,
  totalTime: number,
): { timeOver38G: number; timeOver20G: number } {
  if (samples.length < 2) {
    return { timeOver38G: 0, timeOver20G: 0 }
  }

  const dt = totalTime / (samples.length - 1)
  let timeOver38G = 0
  let timeOver20G = 0

  for (const sample of samples) {
    if (sample.aG > 38) {
      timeOver38G += dt
    }
    if (sample.aG > 20) {
      timeOver20G += dt
    }
  }

  return { timeOver38G, timeOver20G }
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
