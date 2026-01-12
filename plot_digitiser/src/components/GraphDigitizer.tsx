import type { Component } from 'solid-js'
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'

// Types
interface PixelPoint {
  x: number
  y: number
}

interface CalibrationPoint extends PixelPoint {
  value: number
  id: number
}

type LineType = 'horizontal' | 'vertical' | 'angular'

interface DrawingLine {
  id: number
  type: LineType
  clickedPoints: Array<PixelPoint>
  // Fitted endpoints in real (log-scale) coordinates
  startReal: { x: number; y: number } | null
  endReal: { x: number; y: number } | null
}

interface AxisFit {
  // Transform: log10(realValue) = slope * pixelCoord + intercept
  slope: number
  intercept: number
  // Average direction vector of the axis (for rotation)
  dirX: number
  dirY: number
  rotation: number // radians from horizontal (for x) or vertical (for y)
  origin: PixelPoint // reference point on the fitted axis line
  axisLength: number // total length of axis in pixels (for error normalization)
}

interface SaveState {
  version: number
  image: string | null
  xAxisPoints: Array<CalibrationPoint>
  yAxisPoints: Array<CalibrationPoint>
  lines: Array<DrawingLine>
  nextPointId: number
  nextLineId: number
  currentLinePoints: Array<PixelPoint>
  currentLineType: LineType
}

type Mode = 'idle' | 'calibrate-x' | 'calibrate-y' | 'draw'

// Linear regression helper
function linearRegression(
  xs: Array<number>,
  ys: Array<number>,
): { slope: number; intercept: number } {
  const n = xs.length
  if (n < 2) return { slope: 0, intercept: 0 }

  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumX2 = 0
  for (let i = 0; i < n; i++) {
    sumX += xs[i]
    sumY += ys[i]
    sumXY += xs[i] * ys[i]
    sumX2 += xs[i] * xs[i]
  }

  const denom = n * sumX2 - sumX * sumX
  if (Math.abs(denom) < 1e-12) {
    return { slope: 0, intercept: sumY / n }
  }

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

// Fit axis from calibration points using robust linear regression
// For X-axis: Only horizontal (x) position matters - vertical scatter is ignored
// For Y-axis: Only vertical (y) position matters - horizontal scatter is ignored
function fitAxis(points: Array<CalibrationPoint>, axis: 'x' | 'y'): AxisFit | null {
  // Filter out points that haven't been assigned a positive value yet
  const validPoints = points.filter((p) => p.value > 0)
  if (validPoints.length < 2) return null

  // Step 1: Fit a line through all points using linear regression
  // This determines the axis direction robustly from ALL points
  let dirX: number
  let dirY: number
  let originX: number
  let originY: number

  if (axis === 'x') {
    // For X-axis: use pixel X as independent variable (only X position matters)
    // Fit y = m*x + b
    const xs = validPoints.map((p) => p.x)
    const ys = validPoints.map((p) => p.y)
    const { slope: m } = linearRegression(xs, ys)

    // Direction vector: (1, m) normalized
    const len = Math.sqrt(1 + m * m)
    dirX = 1 / len
    dirY = m / len

    // Origin: point on fitted line at mean X
    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length
    const meanY = ys.reduce((a, b) => a + b, 0) / ys.length
    originX = meanX
    originY = meanY // Use actual mean Y (point on least-squares line)
  } else {
    // For Y-axis: use pixel Y as independent variable (only Y position matters)
    // Fit x = m*y + b
    const xs = validPoints.map((p) => p.x)
    const ys = validPoints.map((p) => p.y)
    const { slope: m } = linearRegression(ys, xs) // Note: Y is independent, X is dependent

    // Direction vector: (m, 1) normalized
    const len = Math.sqrt(m * m + 1)
    dirX = m / len
    dirY = 1 / len

    // Origin: point on fitted line at mean Y
    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length
    const meanY = ys.reduce((a, b) => a + b, 0) / ys.length
    originX = meanX
    originY = meanY
  }

  // Step 2: Project each point onto the axis direction to get "distance along axis"
  // The projection uses only the main dimension implicitly through the fitted line
  const projectedDistances: Array<number> = []
  const logValues: Array<number> = []

  for (const p of validPoints) {
    // Distance along axis from origin (projected position)
    const dist = (p.x - originX) * dirX + (p.y - originY) * dirY
    projectedDistances.push(dist)
    logValues.push(Math.log10(p.value))
  }

  // Step 3: Linear regression for value mapping: log10(value) = slope * distance + intercept
  const { slope, intercept } = linearRegression(projectedDistances, logValues)

  // Calculate rotation angle
  const rotation = axis === 'x' ? Math.atan2(dirY, dirX) : Math.atan2(dirX, -dirY)

  // Calculate axis length (span from min to max projected distance)
  const minDist = Math.min(...projectedDistances)
  const maxDist = Math.max(...projectedDistances)
  const axisLength = maxDist - minDist

  return {
    slope,
    intercept,
    dirX,
    dirY,
    rotation,
    origin: { x: originX, y: originY },
    axisLength,
  }
}

// Fit line from points based on type (pixel space - used as fallback when not calibrated)
function fitLine(
  points: Array<PixelPoint>,
  type: LineType,
): { start: PixelPoint; end: PixelPoint } | null {
  if (points.length < 2) return null

  if (type === 'horizontal') {
    // Average y, use min/max x
    const avgY = points.reduce((s, p) => s + p.y, 0) / points.length
    const minX = Math.min(...points.map((p) => p.x))
    const maxX = Math.max(...points.map((p) => p.x))
    return {
      start: { x: minX, y: avgY },
      end: { x: maxX, y: avgY },
    }
  } else if (type === 'vertical') {
    // Average x, use min/max y
    const avgX = points.reduce((s, p) => s + p.x, 0) / points.length
    const minY = Math.min(...points.map((p) => p.y))
    const maxY = Math.max(...points.map((p) => p.y))
    return {
      start: { x: avgX, y: minY },
      end: { x: avgX, y: maxY },
    }
  } else {
    // Angular: fit line y = mx + b, then use x extents
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const { slope, intercept } = linearRegression(xs, ys)

    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    return {
      start: { x: minX, y: slope * minX + intercept },
      end: { x: maxX, y: slope * maxX + intercept },
    }
  }
}

// Transform pixel point to real coordinates using axis calibrations
function pixelToReal(
  pixel: PixelPoint,
  xFit: AxisFit,
  yFit: AxisFit,
): { x: number; y: number } | null {
  // Project onto X axis
  const xDist = (pixel.x - xFit.origin.x) * xFit.dirX + (pixel.y - xFit.origin.y) * xFit.dirY
  const logX = xFit.slope * xDist + xFit.intercept
  const realX = 10 ** logX

  // Project onto Y axis
  const yDist = (pixel.x - yFit.origin.x) * yFit.dirX + (pixel.y - yFit.origin.y) * yFit.dirY
  const logY = yFit.slope * yDist + yFit.intercept
  const realY = 10 ** logY

  return { x: realX, y: realY }
}

// Transform real point to pixel coordinates using axis calibrations
function realToPixel(
  real: { x: number; y: number },
  xFit: AxisFit,
  yFit: AxisFit,
): PixelPoint | null {
  // Compute distances along each axis from the log values
  const logX = Math.log10(real.x)
  const logY = Math.log10(real.y)

  const xDist = (logX - xFit.intercept) / xFit.slope
  const yDist = (logY - yFit.intercept) / yFit.slope

  // Solve linear system to find pixel coordinates
  // xDist = (px - xFit.origin.x) * xFit.dirX + (py - xFit.origin.y) * xFit.dirY
  // yDist = (px - yFit.origin.x) * yFit.dirX + (py - yFit.origin.y) * yFit.dirY
  const a = xFit.dirX
  const b = xFit.dirY
  const c = yFit.dirX
  const d = yFit.dirY
  const e = xDist + xFit.origin.x * a + xFit.origin.y * b
  const f = yDist + yFit.origin.x * c + yFit.origin.y * d

  const det = a * d - b * c
  if (Math.abs(det) < 1e-12) return null

  const px = (e * d - b * f) / det
  const py = (a * f - e * c) / det

  return { x: px, y: py }
}

// Fit line in real (log-scale) coordinate space
// Horizontal/vertical constraints are applied in real space, not pixel space
function fitLineReal(
  points: Array<PixelPoint>,
  type: LineType,
  xFit: AxisFit,
  yFit: AxisFit,
): { startReal: { x: number; y: number }; endReal: { x: number; y: number } } | null {
  if (points.length < 2) return null

  // Convert all points to real coordinates
  const realPoints: Array<{ x: number; y: number }> = []
  for (const p of points) {
    const real = pixelToReal(p, xFit, yFit)
    if (!real) return null
    realPoints.push(real)
  }

  // Work in log space for all operations (geometric mean for averaging)
  const logXs = realPoints.map((p) => Math.log10(p.x))
  const logYs = realPoints.map((p) => Math.log10(p.y))

  if (type === 'horizontal') {
    // Constant Y in real space: average Y (in log space), use min/max X
    const avgLogY = logYs.reduce((s, y) => s + y, 0) / logYs.length
    const minLogX = Math.min(...logXs)
    const maxLogX = Math.max(...logXs)
    return {
      startReal: { x: 10 ** minLogX, y: 10 ** avgLogY },
      endReal: { x: 10 ** maxLogX, y: 10 ** avgLogY },
    }
  } else if (type === 'vertical') {
    // Constant X in real space: average X (in log space), use min/max Y
    const avgLogX = logXs.reduce((s, x) => s + x, 0) / logXs.length
    const minLogY = Math.min(...logYs)
    const maxLogY = Math.max(...logYs)
    return {
      startReal: { x: 10 ** avgLogX, y: 10 ** minLogY },
      endReal: { x: 10 ** avgLogX, y: 10 ** maxLogY },
    }
  } else {
    // Angular: fit line in log-log space: log(y) = m * log(x) + b
    const { slope, intercept } = linearRegression(logXs, logYs)

    const minLogX = Math.min(...logXs)
    const maxLogX = Math.max(...logXs)

    return {
      startReal: { x: 10 ** minLogX, y: 10 ** (slope * minLogX + intercept) },
      endReal: { x: 10 ** maxLogX, y: 10 ** (slope * maxLogX + intercept) },
    }
  }
}

// Convert image element to data URL
function imageToDataUrl(img: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

// Calculate intersection of two infinite lines defined by two points each
// Returns null if lines are parallel
function lineIntersection(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number },
): { x: number; y: number } | null {
  const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y
  const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (Math.abs(denom) < 1e-12) return null // parallel lines

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom

  return {
    x: x1 + t * (x2 - x1),
    y: y1 + t * (y2 - y1),
  }
}


interface LineData {
  id: number
  type: string
  start: { x: number; y: number }
  end: { x: number; y: number }
}

// Calculate sequential path through lines:
// First point of line 1, intersection 1-2, intersection 2-3, ..., last point of last line
function calculateSequentialPath(lines: Array<LineData>): Array<{ x: number; y: number }> {
  if (lines.length === 0) return []

  const points: Array<{ x: number; y: number }> = []

  // First point of the first line
  points.push(lines[0].start)

  // Intersections between consecutive lines
  for (let i = 0; i < lines.length - 1; i++) {
    const line1 = lines[i]
    const line2 = lines[i + 1]
    const intersection = lineIntersection(line1.start, line1.end, line2.start, line2.end)

    // Check if intersection is reasonable (close to where the lines meet)
    // Use midpoint between line1.end and line2.start as the expected meeting point
    const midpoint = {
      x: (line1.end.x + line2.start.x) / 2,
      y: (line1.end.y + line2.start.y) / 2,
    }

    if (intersection) {
      // Check if intersection is within reasonable distance of the midpoint
      const dx = intersection.x - midpoint.x
      const dy = intersection.y - midpoint.y
      const distToMidpoint = Math.sqrt(dx * dx + dy * dy)

      // Calculate the "gap" between line1.end and line2.start
      const gapX = line2.start.x - line1.end.x
      const gapY = line2.start.y - line1.end.y
      const gapSize = Math.sqrt(gapX * gapX + gapY * gapY)

      // If intersection is within 3x the gap size from midpoint, use it
      // Otherwise fall back to midpoint (lines are nearly parallel)
      const threshold = Math.max(gapSize * 3, 0.001)
      if (distToMidpoint < threshold) {
        points.push(intersection)
      } else {
        points.push(midpoint)
      }
    } else {
      // Lines are parallel, use midpoint
      points.push(midpoint)
    }
  }

  // Last point of the last line
  points.push(lines[lines.length - 1].end)

  return points
}

// Format a number without scientific notation, with reasonable precision
function formatNumber(n: number): string {
  if (n === 0) return '0'

  const absN = Math.abs(n)

  // For very small numbers, show enough decimal places
  if (absN < 0.0001) {
    // Find how many decimal places we need
    const decimalPlaces = Math.max(4, -Math.floor(Math.log10(absN)) + 3)
    return n.toFixed(Math.min(decimalPlaces, 10))
  }

  // For small numbers (< 1), show 4 significant figures worth of decimals
  if (absN < 1) {
    const decimalPlaces = Math.max(4, -Math.floor(Math.log10(absN)) + 2)
    return n.toFixed(Math.min(decimalPlaces, 8))
  }

  // For numbers >= 1, use up to 4 decimal places, trimming trailing zeros
  if (absN < 10000) {
    const formatted = n.toFixed(4)
    // Remove trailing zeros after decimal point
    return formatted.replace(/\.?0+$/, '')
  }

  // For large numbers, use no decimal places
  return Math.round(n).toString()
}

// Calculate value-based error for a calibration point
// Returns the difference between the assigned value and the predicted value from the fit,
// expressed as a percentage error: |assigned - predicted| / predicted * 100
function calculatePointError(point: CalibrationPoint, fit: AxisFit | null): number {
  if (!fit || point.value <= 0) return 0

  // Calculate distance along the axis from origin to this point
  const dist = (point.x - fit.origin.x) * fit.dirX + (point.y - fit.origin.y) * fit.dirY

  // Predicted log10 value based on the fit
  const predictedLog = fit.slope * dist + fit.intercept
  const predictedValue = 10 ** predictedLog

  // Actual assigned value
  const actualValue = point.value

  // Percentage error: |actual - predicted| / predicted * 100
  const error = (Math.abs(actualValue - predictedValue) / predictedValue) * 100

  console.log('[DEBUG] calculatePointError:', {
    pointId: point.id,
    actualValue,
    predictedValue: predictedValue.toFixed(4),
    errorPercent: error.toFixed(2),
  })

  return error
}

export const GraphDigitizer: Component = () => {
  // Image state
  const [imageUrl, setImageUrl] = createSignal<string | null>(null)
  const [imageSize, setImageSize] = createSignal<{ width: number; height: number } | null>(null)
  const [imageLoaded, setImageLoaded] = createSignal(false)
  const [imageDataUrl, setImageDataUrl] = createSignal<string | null>(null)
  const [objectUrlToRevoke, setObjectUrlToRevoke] = createSignal<string | null>(null)

  // Mode and calibration state
  const [mode, setMode] = createSignal<Mode>('idle')
  const [xAxisPoints, setXAxisPoints] = createSignal<Array<CalibrationPoint>>([])
  const [yAxisPoints, setYAxisPoints] = createSignal<Array<CalibrationPoint>>([])
  const [activePointId, setActivePointId] = createSignal<number | null>(null)
  const [nextPointId, setNextPointId] = createSignal(1)

  // Store raw input strings to prevent UI jumping while typing
  const [inputStrings, setInputStrings] = createSignal<Map<number, string>>(new Map())

  // Line drawing state
  const [lines, setLines] = createSignal<Array<DrawingLine>>([])
  const [currentLineType, setCurrentLineType] = createSignal<LineType>('horizontal')
  const [currentLinePoints, setCurrentLinePoints] = createSignal<Array<PixelPoint>>([])
  const [nextLineId, setNextLineId] = createSignal(1)

  // Sequential path points (generated on demand)
  const [pathPoints, setPathPoints] = createSignal<Array<{ x: number; y: number }>>([])
  const [pathPixels, setPathPixels] = createSignal<Array<PixelPoint>>([]) // For drawing on canvas

  // Refs
  let canvasRef: HTMLCanvasElement | undefined
  let imageRef: HTMLImageElement | undefined
  let containerRef: HTMLDivElement | undefined
  let loadStateInputRef: HTMLInputElement | undefined

  // Drag and drop state
  const [isDragOver, setIsDragOver] = createSignal(false)

  // Computed axis fits
  const xAxisFit = createMemo(() => {
    const points = xAxisPoints()
    console.log('[DEBUG] xAxisFit recalculating, points:', points.map(p => ({ id: p.id, value: p.value })))
    const fit = fitAxis(points, 'x')
    console.log('[DEBUG] xAxisFit result:', fit)
    return fit
  })
  const yAxisFit = createMemo(() => {
    const points = yAxisPoints()
    console.log('[DEBUG] yAxisFit recalculating, points:', points.map(p => ({ id: p.id, value: p.value })))
    const fit = fitAxis(points, 'y')
    console.log('[DEBUG] yAxisFit result:', fit)
    return fit
  })

  const isCalibrated = createMemo(() => xAxisFit() !== null && yAxisFit() !== null)

  // Computed rotation info with average
  const rotationInfo = createMemo(() => {
    const xFit = xAxisFit()
    const yFit = yAxisFit()
    if (!xFit || !yFit) return null

    const xRotDeg = (xFit.rotation * 180) / Math.PI
    const yRotDeg = (yFit.rotation * 180) / Math.PI

    return {
      xRotation: xRotDeg,
      yRotation: yRotDeg,
      avgRotation: (xRotDeg + yRotDeg) / 2,
    }
  })

  // Export data
  const exportData = createMemo(() => {
    const xFit = xAxisFit()
    const yFit = yAxisFit()
    if (!xFit || !yFit) return []

    return lines()
      .filter((line) => line.startReal && line.endReal)
      .map((line) => ({
        id: line.id,
        type: line.type,
        start: line.startReal,
        end: line.endReal,
      }))
  })

  // Calculate sequential path through lines
  const calculatePath = () => {
    const data = exportData()
    if (data.length === 0) {
      setPathPoints([])
      setPathPixels([])
      return
    }

    const xFit = xAxisFit()
    const yFit = yAxisFit()
    if (!xFit || !yFit) {
      setPathPoints([])
      setPathPixels([])
      return
    }

    const linesWithCoords = data
      .filter((d) => d.start && d.end)
      .map((d) => ({
        id: d.id,
        type: d.type,
        start: d.start as { x: number; y: number },
        end: d.end as { x: number; y: number },
      }))

    const points = calculateSequentialPath(linesWithCoords)
    setPathPoints(points)

    // Convert to pixel coordinates for drawing
    const pixels: Array<PixelPoint> = []
    for (const p of points) {
      const pixel = realToPixel(p, xFit, yFit)
      if (pixel) pixels.push(pixel)
    }
    setPathPixels(pixels)
  }

  // Handle image file input
  const handleFileInput = (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) {
      loadImageFile(file)
    }
  }

  const loadImageFile = (file: File) => {
    // Revoke previous object URL if any
    const prevUrl = objectUrlToRevoke()
    if (prevUrl) URL.revokeObjectURL(prevUrl)

    const url = URL.createObjectURL(file)
    setObjectUrlToRevoke(url)
    setImageUrl(url)
    setImageLoaded(false)
    setImageDataUrl(null)
  }

  // Handle clipboard paste
  const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          loadImageFile(file)
          e.preventDefault()
          break
        }
      }
    }
  }

  // Handle drag over
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  // Handle drag leave
  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  // Handle drop
  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return

    const file = files[0]

    if (file.type.startsWith('image/')) {
      loadImageFile(file)
    } else if (file.name.endsWith('.json') || file.type === 'application/json') {
      loadStateFromFile(file)
    } else {
      alert('Unsupported file type. Please drop an image or JSON file.')
    }
  }

  // Set up paste listener
  onMount(() => {
    document.addEventListener('paste', handlePaste)
  })

  onCleanup(() => {
    document.removeEventListener('paste', handlePaste)
    const url = objectUrlToRevoke()
    if (url) URL.revokeObjectURL(url)
  })

  // Handle image load
  const handleImageLoad = () => {
    if (imageRef) {
      setImageSize({ width: imageRef.naturalWidth, height: imageRef.naturalHeight })
      setImageLoaded(true)

      // Convert to data URL if not already a data URL
      const currentUrl = imageUrl()
      if (currentUrl && !currentUrl.startsWith('data:')) {
        const dataUrl = imageToDataUrl(imageRef)
        if (dataUrl) {
          setImageDataUrl(dataUrl)
        }
      } else if (currentUrl?.startsWith('data:')) {
        setImageDataUrl(currentUrl)
      }
    }
  }

  // Save state to JSON file
  const saveState = () => {
    const dataUrl = imageDataUrl()
    if (!dataUrl) {
      alert('No image data available to save')
      return
    }

    const state: SaveState = {
      version: 1,
      image: dataUrl,
      xAxisPoints: xAxisPoints(),
      yAxisPoints: yAxisPoints(),
      lines: lines(),
      nextPointId: nextPointId(),
      nextLineId: nextLineId(),
      currentLinePoints: currentLinePoints(),
      currentLineType: currentLineType(),
    }

    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `graph-digitizer-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Load state from dropped file
  const loadStateFromFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const state = JSON.parse(event.target?.result as string) as SaveState

        if (state.version !== 1) {
          alert('Unsupported save file version')
          return
        }

        // Revoke previous object URL if any
        const prevUrl = objectUrlToRevoke()
        if (prevUrl) URL.revokeObjectURL(prevUrl)
        setObjectUrlToRevoke(null)

        // Load image from data URL
        if (state.image) {
          setImageUrl(state.image)
          setImageDataUrl(state.image)
          setImageLoaded(false)
        }

        // Restore calibration points
        if (state.xAxisPoints) setXAxisPoints(state.xAxisPoints)
        if (state.yAxisPoints) setYAxisPoints(state.yAxisPoints)

        // Restore lines
        if (state.lines) setLines(state.lines)

        // Restore IDs
        if (state.nextPointId) setNextPointId(state.nextPointId)
        if (state.nextLineId) setNextLineId(state.nextLineId)

        // Restore current drawing state
        if (state.currentLinePoints) setCurrentLinePoints(state.currentLinePoints)
        if (state.currentLineType) setCurrentLineType(state.currentLineType)

        // Reset mode and pending state
        setMode('idle')
        setActivePointId(null)
        setInputStrings(new Map())
      } catch (err) {
        alert(`Failed to load state file: ${(err as Error).message}`)
      }
    }
    reader.readAsText(file)
  }

  // Load state from input file
  const loadState = (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    loadStateFromFile(file)

    // Reset input so same file can be loaded again
    input.value = ''
  }

  // Handle canvas click
  const handleCanvasClick = (e: MouseEvent) => {
    if (!canvasRef || !containerRef) return

    const rect = canvasRef.getBoundingClientRect()
    const scaleX = canvasRef.width / rect.width
    const scaleY = canvasRef.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    if (mode() === 'calibrate-x' || mode() === 'calibrate-y') {
      // Add point immediately with placeholder value
      const id = nextPointId()
      const newPoint: CalibrationPoint = {
        x,
        y,
        value: 0, // 0 indicates "not yet set"
        id,
      }
      setNextPointId((n) => n + 1)

      if (mode() === 'calibrate-x') {
        setXAxisPoints((prev) => [...prev, newPoint])
      } else {
        setYAxisPoints((prev) => [...prev, newPoint])
      }

      // Auto-focus the new point's input
      setActivePointId(id)
      setTimeout(() => {
        document.getElementById(`cal-input-${id}`)?.focus()
      }, 0)
    } else if (mode() === 'draw') {
      setCurrentLinePoints((prev) => [...prev, { x, y }])
    }
  }

  // Commit value from input string to state
  const commitCalibrationValue = (axis: 'x' | 'y', id: number, valueStr: string) => {
    console.log('[DEBUG] commitCalibrationValue called:', { axis, id, valueStr })
    const val = Number.parseFloat(valueStr)
    const num = Number.isNaN(val) ? 0 : val
    console.log('[DEBUG] parsed value:', num)

    // Clear the temporary input string
    setInputStrings((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })

    const updateFn = axis === 'x' ? setXAxisPoints : setYAxisPoints
    updateFn((prev) => {
      const newPoints = prev.map((p) => (p.id === id ? { ...p, value: num } : p))
      console.log('[DEBUG] updating points, old:', prev.map(p => ({ id: p.id, value: p.value })))
      console.log('[DEBUG] updating points, new:', newPoints.map(p => ({ id: p.id, value: p.value })))
      return newPoints
    })
  }

  // Handle input change (store raw string)
  const handleCalibrationInput = (id: number, value: string) => {
    setInputStrings((prev) => {
      const next = new Map(prev)
      next.set(id, value)
      return next
    })
  }

  // Handle keyboard navigation for calibration inputs
  const handleCalibrationKeyDown = (
    e: KeyboardEvent,
    index: number,
    axis: 'x' | 'y',
    id: number,
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const points = axis === 'x' ? xAxisPoints() : yAxisPoints()
      const currentInput = e.currentTarget as HTMLInputElement
      const value = currentInput.value

      // Commit current value
      commitCalibrationValue(axis, id, value)

      // Focus next input
      if (index < points.length - 1) {
        const nextPoint = points[index + 1]
        setActivePointId(nextPoint.id)
        setTimeout(() => {
          document.getElementById(`cal-input-${nextPoint.id}`)?.focus()
        }, 0)
      }
    }
  }

  // Finalize current line
  const finalizeLine = () => {
    const points = currentLinePoints()
    if (points.length < 2) {
      alert('Need at least 2 points to create a line')
      return
    }

    const xFit = xAxisFit()
    const yFit = yAxisFit()

    let startReal = null
    let endReal = null

    if (xFit && yFit) {
      // Fit line in real coordinate space (horizontal/vertical constraints applied there)
      const fittedReal = fitLineReal(points, currentLineType(), xFit, yFit)
      if (fittedReal) {
        startReal = fittedReal.startReal
        endReal = fittedReal.endReal
      }
    }

    const newLine: DrawingLine = {
      id: nextLineId(),
      type: currentLineType(),
      clickedPoints: [...points],
      startReal,
      endReal,
    }

    setLines((prev) => [...prev, newLine])
    setNextLineId((n) => n + 1)
    setCurrentLinePoints([])
  }

  // Delete a line
  const deleteLine = (id: number) => {
    setLines((prev) => prev.filter((l) => l.id !== id))
  }

  // Delete calibration point
  const deleteCalibrationPoint = (axis: 'x' | 'y', id: number) => {
    const updateFn = axis === 'x' ? setXAxisPoints : setYAxisPoints
    updateFn((prev) => {
      const filtered = prev.filter((p) => p.id !== id)
      // If we deleted the active point, clear active point
      if (activePointId() === id) {
        setActivePointId(null)
      }
      return filtered
    })
    // Also remove from input strings map
    setInputStrings((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }

  // Clear all
  const clearAll = () => {
    setXAxisPoints([])
    setYAxisPoints([])
    setLines([])
    setCurrentLinePoints([])
    setActivePointId(null)
    setInputStrings(new Map())
    setPathPoints([])
    setPathPixels([])
    setMode('idle')
  }

  // Render canvas
  const renderCanvas = () => {
    if (!canvasRef || !imageRef || !imageLoaded()) return

    const ctx = canvasRef.getContext('2d')
    if (!ctx) return

    const size = imageSize()
    if (!size) return

    canvasRef.width = size.width
    canvasRef.height = size.height

    // Draw image
    ctx.drawImage(imageRef, 0, 0)

    const activeId = activePointId()

    // Draw X axis calibration points
    ctx.fillStyle = '#ef4444'
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    for (const p of xAxisPoints()) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      // Draw value if valid, otherwise draw placeholder or index
      ctx.fillStyle = '#fff'
      ctx.font = '12px sans-serif'
      const label = p.value > 0 ? p.value.toString() : '#'
      ctx.fillText(label, p.x + 12, p.y + 4)
      ctx.fillStyle = '#ef4444'
    }

    // Draw Y axis calibration points
    ctx.fillStyle = '#3b82f6'
    for (const p of yAxisPoints()) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.font = '12px sans-serif'
      const label = p.value > 0 ? p.value.toString() : '#'
      ctx.fillText(label, p.x + 12, p.y + 4)
      ctx.fillStyle = '#3b82f6'
    }

    // Draw active point highlight (on top of everything else so far)
    if (activeId !== null) {
      const allPoints = [...xAxisPoints(), ...yAxisPoints()]
      const activePoint = allPoints.find((p) => p.id === activeId)
      if (activePoint) {
        ctx.lineWidth = 4
        ctx.strokeStyle = '#f59e0b' // Amber-500
        ctx.beginPath()
        ctx.arc(activePoint.x, activePoint.y, 14, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    const xFitVal = xAxisFit()
    const yFitVal = yAxisFit()

    // Draw finalized lines (using real coords transformed back to pixels)
    for (const line of lines()) {
      if (!line.startReal || !line.endReal || !xFitVal || !yFitVal) continue

      const startPixel = realToPixel(line.startReal, xFitVal, yFitVal)
      const endPixel = realToPixel(line.endReal, xFitVal, yFitVal)

      if (!startPixel || !endPixel) continue

      ctx.strokeStyle = '#22c55e'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(startPixel.x, startPixel.y)
      ctx.lineTo(endPixel.x, endPixel.y)
      ctx.stroke()

      // Draw endpoints
      ctx.fillStyle = '#22c55e'
      ctx.beginPath()
      ctx.arc(startPixel.x, startPixel.y, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(endPixel.x, endPixel.y, 6, 0, Math.PI * 2)
      ctx.fill()
    }

    // Draw current line points
    ctx.fillStyle = '#f59e0b'
    for (const p of currentLinePoints()) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
      ctx.fill()
    }

    // Draw current line preview
    const curPoints = currentLinePoints()
    if (curPoints.length >= 2) {
      let startPixel: PixelPoint | null = null
      let endPixel: PixelPoint | null = null

      if (xFitVal && yFitVal) {
        // Use real-space fitting for accurate preview
        const fittedReal = fitLineReal(curPoints, currentLineType(), xFitVal, yFitVal)
        if (fittedReal) {
          startPixel = realToPixel(fittedReal.startReal, xFitVal, yFitVal)
          endPixel = realToPixel(fittedReal.endReal, xFitVal, yFitVal)
        }
      }

      // Fallback to pixel-space preview if not calibrated
      if (!startPixel || !endPixel) {
        const fitted = fitLine(curPoints, currentLineType())
        if (fitted) {
          startPixel = fitted.start
          endPixel = fitted.end
        }
      }

      if (startPixel && endPixel) {
        ctx.strokeStyle = '#f59e0b'
        ctx.lineWidth = 2
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.moveTo(startPixel.x, startPixel.y)
        ctx.lineTo(endPixel.x, endPixel.y)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // Draw path points if calculated
    const pPixels = pathPixels()
    if (pPixels.length > 0) {
      ctx.fillStyle = '#a855f7' // purple-500
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      for (const p of pPixels) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    }
  }

  // Re-render on state changes
  createEffect(() => {
    imageLoaded()
    xAxisPoints()
    yAxisPoints()
    lines()
    currentLinePoints()
    activePointId()
    pathPixels()
    renderCanvas()
  })

  return (
    <div
      class="min-h-screen bg-slate-50 text-gray-900"
      classList={{ 'bg-blue-50 border-2 border-dashed border-blue-300': isDragOver() }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div class="max-w-7xl mx-auto py-6 px-4 space-y-4">
        <header class="space-y-2">
          <h1 class="text-2xl font-bold">Graph Digitizer (Log-Log)</h1>
          <p class="text-gray-600">
            Digitize scanned log-log graphs. Paste image from clipboard, load a file, or drag and
            drop an image or JSON state file onto the interface.
          </p>
        </header>

        {/* Image input */}
        <div class="bg-white rounded-lg shadow-sm border p-4 space-y-3">
          <div class="flex gap-4 items-center flex-wrap">
            <label class="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
              Load Image
              <input type="file" accept="image/*" class="hidden" onChange={handleFileInput} />
            </label>
            <span class="text-gray-500">or paste from clipboard (Ctrl+V) or drag and drop</span>
            <span class="text-gray-300">|</span>
            <label class="cursor-pointer bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">
              Load State
              <input
                ref={loadStateInputRef}
                type="file"
                accept=".json,application/json"
                class="hidden"
                onChange={loadState}
              />
            </label>
            <button
              class="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={saveState}
              disabled={!imageDataUrl()}
            >
              Save State
            </button>
          </div>
        </div>

        <Show when={imageUrl()}>
          {/* Hidden image for loading */}
          <img
            ref={imageRef}
            src={imageUrl()!}
            class="hidden"
            onLoad={handleImageLoad}
            alt="Graph"
          />

          {/* Mode selection */}
          <div class="bg-white rounded-lg shadow-sm border p-4 space-y-3">
            <h2 class="font-semibold">Mode</h2>
            <div class="flex gap-2 flex-wrap">
              <button
                class="px-4 py-2 rounded border"
                classList={{
                  'bg-red-100 border-red-400': mode() === 'calibrate-x',
                  'hover:bg-gray-100': mode() !== 'calibrate-x',
                }}
                onClick={() => {
                  const nextMode = mode() === 'calibrate-x' ? 'idle' : 'calibrate-x'
                  setMode(nextMode)
                  setActivePointId(null)
                }}
              >
                Calibrate X-Axis
              </button>
              <button
                class="px-4 py-2 rounded border"
                classList={{
                  'bg-blue-100 border-blue-400': mode() === 'calibrate-y',
                  'hover:bg-gray-100': mode() !== 'calibrate-y',
                }}
                onClick={() => {
                  const nextMode = mode() === 'calibrate-y' ? 'idle' : 'calibrate-y'
                  setMode(nextMode)
                  setActivePointId(null)
                }}
              >
                Calibrate Y-Axis
              </button>
              <button
                class="px-4 py-2 rounded border"
                classList={{
                  'bg-green-100 border-green-400': mode() === 'draw',
                  'hover:bg-gray-100': mode() !== 'draw',
                  'opacity-50 cursor-not-allowed': !isCalibrated(),
                }}
                onClick={() => {
                  const isDraw = mode() === 'draw'
                  if (isCalibrated()) {
                    setMode(isDraw ? 'idle' : 'draw')
                  }
                }}
                disabled={!isCalibrated()}
              >
                Draw Lines
              </button>
              <button
                class="px-4 py-2 rounded border bg-gray-200 hover:bg-gray-300"
                onClick={clearAll}
              >
                Clear All
              </button>
              <span class="text-gray-300">|</span>
              <button
                class="px-4 py-2 rounded border bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={calculatePath}
                disabled={exportData().length === 0}
              >
                Calculate Path
              </button>
            </div>

            {/* Calibration status */}
            <div class="text-sm text-gray-600 space-y-1">
              <p>
                X-Axis: {xAxisPoints().length} points
                {xAxisFit() && (
                  <span class="text-green-600 ml-2">
                    ✓ Fitted (rotation: {((xAxisFit()!.rotation * 180) / Math.PI).toFixed(2)}°)
                  </span>
                )}
              </p>
              <p>
                Y-Axis: {yAxisPoints().length} points
                {yAxisFit() && (
                  <span class="text-green-600 ml-2">
                    ✓ Fitted (rotation: {((yAxisFit()!.rotation * 180) / Math.PI).toFixed(2)}°)
                  </span>
                )}
              </p>
              <Show when={rotationInfo()}>
                <p class="font-medium text-indigo-600">
                  Average rotation: {rotationInfo()!.avgRotation.toFixed(2)}°
                </p>
              </Show>
            </div>
          </div>

          {/* Drawing controls */}
          <Show when={mode() === 'draw'}>
            <div class="bg-white rounded-lg shadow-sm border p-4 space-y-3">
              <h2 class="font-semibold">Draw Line</h2>
              <div class="flex gap-3 items-center flex-wrap">
                <span>Type:</span>
                <select
                  class="border rounded px-3 py-1.5"
                  value={currentLineType()}
                  onChange={(e) => {
                    setCurrentLineType(e.currentTarget.value as LineType)
                    setCurrentLinePoints([])
                  }}
                >
                  <option value="horizontal">Horizontal</option>
                  <option value="vertical">Vertical</option>
                  <option value="angular">Angular</option>
                </select>
                <span class="text-gray-500">|</span>
                <span>Points clicked: {currentLinePoints().length}</span>
                <button
                  class="bg-green-600 text-white px-4 py-1.5 rounded hover:bg-green-700 disabled:opacity-50"
                  onClick={finalizeLine}
                  disabled={currentLinePoints().length < 2}
                >
                  Finalize Line
                </button>
                <button
                  class="bg-gray-300 px-4 py-1.5 rounded hover:bg-gray-400"
                  onClick={() => setCurrentLinePoints([])}
                >
                  Clear Points
                </button>
              </div>
              <p class="text-sm text-gray-500">
                Click 2+ points along the line segment. Horizontal/vertical constraints are applied
                in real coordinate space.
              </p>
            </div>
          </Show>

          {/* Canvas */}
          <div ref={containerRef} class="bg-white rounded-lg shadow-sm border p-2 overflow-auto">
            <canvas
              ref={canvasRef}
              class="max-w-full cursor-crosshair"
              onClick={handleCanvasClick}
            />
          </div>

          {/* Calibration points lists */}
          <div class="grid md:grid-cols-2 gap-4">
            <div
              class="bg-white rounded-lg shadow-sm border p-4 transition-colors"
              classList={{ 'ring-2 ring-red-300': mode() === 'calibrate-x' }}
            >
              <div class="flex justify-between items-center mb-2">
                <h3 class="font-semibold text-red-600">X-Axis Points</h3>
                <Show when={mode() === 'calibrate-x'}>
                  <span class="text-xs text-red-500 font-medium">Click graph to add points</span>
                </Show>
              </div>
              <Show when={xAxisPoints().length === 0}>
                <p class="text-gray-500 text-sm">No points yet</p>
              </Show>
              <ul class="space-y-2">
                <For each={xAxisPoints()}>
                  {(p, index) => {
                    // Access current point reactively from the array (p is a static snapshot)
                    const currentPoint = () => xAxisPoints().find((pt) => pt.id === p.id) ?? p
                    const rawInput = () => inputStrings().get(p.id)
                    const displayValue = () => {
                      const raw = rawInput()
                      const pt = currentPoint()
                      return raw !== undefined ? raw : pt.value === 0 ? '' : String(pt.value)
                    }
                    // Compute error reactively - depends on both point and fit
                    const pointError = () => {
                      const fit = xAxisFit()
                      const pt = currentPoint()
                      console.log('[DEBUG] X pointError() called for id:', p.id, 'pt.value:', pt.value, 'fit:', fit ? 'exists' : 'null')
                      if (!fit || pt.value <= 0) return null
                      const err = calculatePointError(pt, fit)
                      console.log('[DEBUG] X pointError result:', err)
                      return err
                    }
                    return (
                      <li class="flex items-center gap-2 text-sm py-1 border-b last:border-0">
                        <span class="w-6 text-gray-400 text-xs">#{index() + 1}</span>
                        <span class="font-mono text-gray-500 text-xs w-20">
                          ({p.x.toFixed(0)}, {p.y.toFixed(0)})
                        </span>
                        <input
                          id={`cal-input-${p.id}`}
                          type="text"
                          class="border rounded px-2 py-1 w-32 text-sm focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none"
                          placeholder="Value"
                          value={displayValue()}
                          onInput={(e) => handleCalibrationInput(p.id, e.currentTarget.value)}
                          onFocus={() => setActivePointId(p.id)}
                          onBlur={(e) => commitCalibrationValue('x', p.id, e.currentTarget.value)}
                          onKeyDown={(e) => handleCalibrationKeyDown(e, index(), 'x', p.id)}
                        />
                        <span
                          class="text-xs text-gray-400 w-14 text-right"
                          title="Deviation from axis as % of axis span"
                        >
                          {(() => {
                            const err = pointError()
                            const text = err !== null ? `±${err.toFixed(2)}%` : ''
                            console.log('[DEBUG] X render error for id:', p.id, 'text:', text)
                            return text
                          })()}
                        </span>
                        <button
                          class="text-red-400 hover:text-red-600 text-sm p-1 ml-auto"
                          onClick={() => deleteCalibrationPoint('x', p.id)}
                          title="Remove point"
                        >
                          ✕
                        </button>
                      </li>
                    )
                  }}
                </For>
              </ul>
            </div>

            <div
              class="bg-white rounded-lg shadow-sm border p-4 transition-colors"
              classList={{ 'ring-2 ring-blue-300': mode() === 'calibrate-y' }}
            >
              <div class="flex justify-between items-center mb-2">
                <h3 class="font-semibold text-blue-600">Y-Axis Points</h3>
                <Show when={mode() === 'calibrate-y'}>
                  <span class="text-xs text-blue-500 font-medium">Click graph to add points</span>
                </Show>
              </div>
              <Show when={yAxisPoints().length === 0}>
                <p class="text-gray-500 text-sm">No points yet</p>
              </Show>
              <ul class="space-y-2">
                <For each={yAxisPoints()}>
                  {(p, index) => {
                    // Access current point reactively from the array (p is a static snapshot)
                    const currentPoint = () => yAxisPoints().find((pt) => pt.id === p.id) ?? p
                    const rawInput = () => inputStrings().get(p.id)
                    const displayValue = () => {
                      const raw = rawInput()
                      const pt = currentPoint()
                      return raw !== undefined ? raw : pt.value === 0 ? '' : String(pt.value)
                    }
                    // Compute error reactively - depends on both point and fit
                    const pointError = () => {
                      const fit = yAxisFit()
                      const pt = currentPoint()
                      console.log('[DEBUG] Y pointError() called for id:', p.id, 'pt.value:', pt.value, 'fit:', fit ? 'exists' : 'null')
                      if (!fit || pt.value <= 0) return null
                      const err = calculatePointError(pt, fit)
                      console.log('[DEBUG] Y pointError result:', err)
                      return err
                    }
                    return (
                      <li class="flex items-center gap-2 text-sm py-1 border-b last:border-0">
                        <span class="w-6 text-gray-400 text-xs">#{index() + 1}</span>
                        <span class="font-mono text-gray-500 text-xs w-20">
                          ({p.x.toFixed(0)}, {p.y.toFixed(0)})
                        </span>
                        <input
                          id={`cal-input-${p.id}`}
                          type="text"
                          class="border rounded px-2 py-1 w-32 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                          placeholder="Value"
                          value={displayValue()}
                          onInput={(e) => handleCalibrationInput(p.id, e.currentTarget.value)}
                          onFocus={() => setActivePointId(p.id)}
                          onBlur={(e) => commitCalibrationValue('y', p.id, e.currentTarget.value)}
                          onKeyDown={(e) => handleCalibrationKeyDown(e, index(), 'y', p.id)}
                        />
                        <span
                          class="text-xs text-gray-400 w-14 text-right"
                          title="Deviation from axis as % of axis span"
                        >
                          {(() => {
                            const err = pointError()
                            const text = err !== null ? `±${err.toFixed(2)}%` : ''
                            console.log('[DEBUG] Y render error for id:', p.id, 'text:', text)
                            return text
                          })()}
                        </span>
                        <button
                          class="text-red-400 hover:text-red-600 text-sm p-1 ml-auto"
                          onClick={() => deleteCalibrationPoint('y', p.id)}
                          title="Remove point"
                        >
                          ✕
                        </button>
                      </li>
                    )
                  }}
                </For>
              </ul>
            </div>
          </div>

          {/* Lines list */}
          <Show when={lines().length > 0}>
            <div class="bg-white rounded-lg shadow-sm border p-4">
              <h3 class="font-semibold mb-2 text-green-600">Lines ({lines().length})</h3>
              <ul class="space-y-2 text-sm">
                <For each={lines()}>
                  {(line) => (
                    <li class="flex justify-between items-center border-b pb-2">
                      <span>
                        <strong>#{line.id}</strong> ({line.type})
                        {line.startReal && line.endReal && (
                          <span class="ml-2 text-gray-600">
                            ({formatNumber(line.startReal.x)}, {formatNumber(line.startReal.y)}) → (
                            {formatNumber(line.endReal.x)}, {formatNumber(line.endReal.y)})
                          </span>
                        )}
                      </span>
                      <button
                        class="text-red-500 hover:text-red-700"
                        onClick={() => deleteLine(line.id)}
                      >
                        Delete
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </Show>

          {/* Export JSON */}
          <Show when={exportData().length > 0}>
            <div class="bg-white rounded-lg shadow-sm border p-4 space-y-2">
              <h3 class="font-semibold">Export Lines JSON</h3>
              <textarea
                class="w-full h-64 font-mono text-sm border rounded p-2"
                readOnly
                value={JSON.stringify(exportData(), null, 2)}
              />
              <button
                class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(exportData(), null, 2))
                  alert('Copied to clipboard!')
                }}
              >
                Copy to Clipboard
              </button>
            </div>
          </Show>

          {/* Path Points Export */}
          <Show when={pathPoints().length > 0}>
            {(() => {
              const points = () => pathPoints().map((p) => [p.x, p.y])
              return (
                <div class="bg-white rounded-lg shadow-sm border p-4 space-y-2">
                  <h3 class="font-semibold text-purple-600">Sequential Path Points</h3>
                  <p class="text-sm text-gray-600">
                    {pathPoints().length} points: first point, {pathPoints().length - 2} intersections, last point
                  </p>
                  <textarea
                    class="w-full h-48 font-mono text-sm border rounded p-2"
                    readOnly
                    value={JSON.stringify(points(), null, 2)}
                  />
                  <div class="flex gap-2">
                    <button
                      class="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(points(), null, 2))
                        alert('Path points copied to clipboard!')
                      }}
                    >
                      Copy to Clipboard
                    </button>
                    <button
                      class="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
                      onClick={() => {
                        setPathPoints([])
                        setPathPixels([])
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )
            })()}
          </Show>
        </Show>

        <Show when={!imageUrl()}>
          <div class="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-500">
            <p class="text-lg">Load an image to begin</p>
            <p class="text-sm mt-2">
              Paste from clipboard, use the Load Image button, or drag and drop an image or JSON
              file here
            </p>
          </div>
        </Show>
      </div>
    </div>
  )
}
