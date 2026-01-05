import type { Component } from 'solid-js'
import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'

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
  origin: PixelPoint // reference point (first calibration point)
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

// Fit axis from calibration points
function fitAxis(points: Array<CalibrationPoint>, axis: 'x' | 'y'): AxisFit | null {
  if (points.length < 2) return null

  // Sort points by their pixel coordinate along the axis
  const sorted = [...points].sort((a, b) => (axis === 'x' ? a.x - b.x : b.y - a.y))

  // Calculate direction vector from first to last point
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const dx = last.x - first.x
  const dy = last.y - first.y
  const len = Math.sqrt(dx * dx + dy * dy)

  if (len < 1) return null

  const dirX = dx / len
  const dirY = dy / len

  // Project each point onto the axis direction to get "distance along axis"
  const projectedDistances: Array<number> = []
  const logValues: Array<number> = []

  for (const p of sorted) {
    // Distance along axis from first point
    const dist = (p.x - first.x) * dirX + (p.y - first.y) * dirY
    projectedDistances.push(dist)
    logValues.push(Math.log10(p.value))
  }

  // Linear regression: log10(value) = slope * distance + intercept
  const { slope, intercept } = linearRegression(projectedDistances, logValues)

  // Calculate rotation angle
  const rotation = axis === 'x' ? Math.atan2(dirY, dirX) : Math.atan2(dirX, -dirY)

  return {
    slope,
    intercept,
    dirX,
    dirY,
    rotation,
    origin: { x: first.x, y: first.y },
  }
}

// Fit line from points based on type
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
  const [pendingValue, setPendingValue] = createSignal<string>('')
  const [pendingClick, setPendingClick] = createSignal<PixelPoint | null>(null)
  const [nextPointId, setNextPointId] = createSignal(1)

  // Line drawing state
  const [lines, setLines] = createSignal<Array<DrawingLine>>([])
  const [currentLineType, setCurrentLineType] = createSignal<LineType>('horizontal')
  const [currentLinePoints, setCurrentLinePoints] = createSignal<Array<PixelPoint>>([])
  const [nextLineId, setNextLineId] = createSignal(1)

  // Refs
  let canvasRef: HTMLCanvasElement | undefined
  let imageRef: HTMLImageElement | undefined
  let containerRef: HTMLDivElement | undefined
  let loadStateInputRef: HTMLInputElement | undefined

  // Drag and drop state
  const [isDragOver, setIsDragOver] = createSignal(false)

  // Computed axis fits
  const xAxisFit = createMemo(() => fitAxis(xAxisPoints(), 'x'))
  const yAxisFit = createMemo(() => fitAxis(yAxisPoints(), 'y'))

  const isCalibrated = createMemo(() => xAxisFit() !== null && yAxisFit() !== null)

  // Computed rotation info
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
        setPendingClick(null)
        setPendingValue('')
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

    const point: PixelPoint = { x, y }

    if (mode() === 'calibrate-x' || mode() === 'calibrate-y') {
      setPendingClick(point)
      setPendingValue('')
    } else if (mode() === 'draw') {
      setCurrentLinePoints((prev) => [...prev, point])
    }
  }

  // Add calibration point
  const addCalibrationPoint = () => {
    const click = pendingClick()
    const valueStr = pendingValue()
    if (!click || !valueStr) return

    const value = Number.parseFloat(valueStr)
    if (Number.isNaN(value) || value <= 0) {
      alert('Value must be a positive number')
      return
    }

    const point: CalibrationPoint = {
      ...click,
      value,
      id: nextPointId(),
    }
    setNextPointId((n) => n + 1)

    if (mode() === 'calibrate-x') {
      setXAxisPoints((prev) => [...prev, point])
    } else if (mode() === 'calibrate-y') {
      setYAxisPoints((prev) => [...prev, point])
    }

    setPendingClick(null)
    setPendingValue('')
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
    const fitted = fitLine(points, currentLineType())

    if (!fitted) return

    let startReal = null
    let endReal = null

    if (xFit && yFit) {
      startReal = pixelToReal(fitted.start, xFit, yFit)
      endReal = pixelToReal(fitted.end, xFit, yFit)
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
    if (axis === 'x') {
      setXAxisPoints((prev) => prev.filter((p) => p.id !== id))
    } else {
      setYAxisPoints((prev) => prev.filter((p) => p.id !== id))
    }
  }

  // Clear all
  const clearAll = () => {
    setXAxisPoints([])
    setYAxisPoints([])
    setLines([])
    setCurrentLinePoints([])
    setPendingClick(null)
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

    // Draw X axis calibration points
    ctx.fillStyle = '#ef4444'
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    for (const p of xAxisPoints()) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.font = '12px sans-serif'
      ctx.fillText(p.value.toString(), p.x + 12, p.y + 4)
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
      ctx.fillText(p.value.toString(), p.x + 12, p.y + 4)
      ctx.fillStyle = '#3b82f6'
    }

    // Draw pending click
    const pending = pendingClick()
    if (pending) {
      ctx.fillStyle = mode() === 'calibrate-x' ? '#fca5a5' : '#93c5fd'
      ctx.beginPath()
      ctx.arc(pending.x, pending.y, 10, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }

    // Draw finalized lines
    for (const line of lines()) {
      const fitted = fitLine(line.clickedPoints, line.type)
      if (!fitted) continue

      ctx.strokeStyle = '#22c55e'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(fitted.start.x, fitted.start.y)
      ctx.lineTo(fitted.end.x, fitted.end.y)
      ctx.stroke()

      // Draw endpoints
      ctx.fillStyle = '#22c55e'
      ctx.beginPath()
      ctx.arc(fitted.start.x, fitted.start.y, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(fitted.end.x, fitted.end.y, 6, 0, Math.PI * 2)
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
      const fitted = fitLine(curPoints, currentLineType())
      if (fitted) {
        ctx.strokeStyle = '#f59e0b'
        ctx.lineWidth = 2
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.moveTo(fitted.start.x, fitted.start.y)
        ctx.lineTo(fitted.end.x, fitted.end.y)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
  }

  // Re-render on state changes
  createMemo(() => {
    imageLoaded()
    xAxisPoints()
    yAxisPoints()
    lines()
    currentLinePoints()
    pendingClick()
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
                onClick={() => setMode(mode() === 'calibrate-x' ? 'idle' : 'calibrate-x')}
              >
                Calibrate X-Axis
              </button>
              <button
                class="px-4 py-2 rounded border"
                classList={{
                  'bg-blue-100 border-blue-400': mode() === 'calibrate-y',
                  'hover:bg-gray-100': mode() !== 'calibrate-y',
                }}
                onClick={() => setMode(mode() === 'calibrate-y' ? 'idle' : 'calibrate-y')}
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
                onClick={() => isCalibrated() && setMode(mode() === 'draw' ? 'idle' : 'draw')}
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
            </div>
          </div>

          {/* Pending calibration point input */}
          <Show when={pendingClick() && (mode() === 'calibrate-x' || mode() === 'calibrate-y')}>
            <div class="bg-white rounded-lg shadow-sm border p-4">
              <div class="flex gap-3 items-center">
                <span class="font-medium">
                  Enter {mode() === 'calibrate-x' ? 'X' : 'Y'} value for clicked point:
                </span>
                <input
                  type="number"
                  step="any"
                  class="border rounded px-3 py-1.5 w-32"
                  placeholder="e.g., 0.01"
                  value={pendingValue()}
                  onInput={(e) => setPendingValue(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCalibrationPoint()}
                />
                <button
                  class="bg-green-600 text-white px-4 py-1.5 rounded hover:bg-green-700"
                  onClick={addCalibrationPoint}
                >
                  Add
                </button>
                <button
                  class="bg-gray-300 px-4 py-1.5 rounded hover:bg-gray-400"
                  onClick={() => setPendingClick(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </Show>

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
                Click 2+ points along the line segment. The tool will fit the best line.
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
            <div class="bg-white rounded-lg shadow-sm border p-4">
              <h3 class="font-semibold mb-2 text-red-600">X-Axis Points</h3>
              <Show when={xAxisPoints().length === 0}>
                <p class="text-gray-500 text-sm">No points yet</p>
              </Show>
              <ul class="space-y-1 text-sm">
                <For each={xAxisPoints()}>
                  {(p) => (
                    <li class="flex justify-between items-center">
                      <span>
                        ({p.x.toFixed(0)}, {p.y.toFixed(0)}) → {p.value}
                      </span>
                      <button
                        class="text-red-500 hover:text-red-700 text-xs"
                        onClick={() => deleteCalibrationPoint('x', p.id)}
                      >
                        ✕
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </div>
            <div class="bg-white rounded-lg shadow-sm border p-4">
              <h3 class="font-semibold mb-2 text-blue-600">Y-Axis Points</h3>
              <Show when={yAxisPoints().length === 0}>
                <p class="text-gray-500 text-sm">No points yet</p>
              </Show>
              <ul class="space-y-1 text-sm">
                <For each={yAxisPoints()}>
                  {(p) => (
                    <li class="flex justify-between items-center">
                      <span>
                        ({p.x.toFixed(0)}, {p.y.toFixed(0)}) → {p.value}
                      </span>
                      <button
                        class="text-red-500 hover:text-red-700 text-xs"
                        onClick={() => deleteCalibrationPoint('y', p.id)}
                      >
                        ✕
                      </button>
                    </li>
                  )}
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
                            ({line.startReal.x.toExponential(3)},{' '}
                            {line.startReal.y.toExponential(3)}) → (
                            {line.endReal.x.toExponential(3)}, {line.endReal.y.toExponential(3)})
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
              <h3 class="font-semibold">Export JSON</h3>
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
