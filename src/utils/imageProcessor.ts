// ImageMagick processing utilities

import type { ProcessOptions, ProcessResult, OutputFormat } from './types'
import { generateOutputPath, getImageDimensions } from './fileScanner'
import { getMagickFFI, isFFIAvailable } from './magickFFI'
import { buildMagickArgs } from './magickShared'

/**
 * Result of file size estimation for multiple formats
 */
export interface FileSizeEstimate {
  format: OutputFormat
  estimatedSize: number
  originalSize: number
  decreasePercent: number
}

export interface EstimateFileSizeResult {
  success: boolean
  estimates?: FileSizeEstimate[]
  error?: string
}

// Debug logging
const DEBUG = Bun.env.DEBUG?.includes('magick') ?? false

function debugLog(message: string, ...args: unknown[]): void {
  if (DEBUG) {
    console.log(`[ImageProcessor] ${message}`, ...args)
  }
}

// Worker-based estimation for non-blocking UI
let estimateWorker: Worker | null = null
let requestId = 0
const pendingRequests = new Map<number, {
  resolve: (result: EstimateFileSizeResult) => void
  reject: (error: Error) => void
}>()

function getEstimateWorker(): Worker {
  if (!estimateWorker) {
    estimateWorker = new Worker(new URL('./estimateWorker.ts', import.meta.url).href)
    estimateWorker.onmessage = (event) => {
      const { id, success, estimates, error } = event.data
      const pending = pendingRequests.get(id)
      if (pending) {
        pendingRequests.delete(id)
        if (success) {
          pending.resolve({ success: true, estimates })
        } else {
          pending.resolve({ success: false, error })
        }
      }
    }
    estimateWorker.onerror = (error) => {
      debugLog('Worker error:', error)
    }
  }
  return estimateWorker
}

/**
 * Estimate file sizes using a Web Worker (non-blocking)
 * This runs the estimation in a separate thread to keep the UI responsive
 */
export function estimateFileSizeAsync(
  inputPath: string,
  originalSize: number,
  formats: OutputFormat[],
  quality: number,
  resizeWidth: number | null,
  resizeHeight: number | null
): { promise: Promise<EstimateFileSizeResult>; id: number } {
  const id = ++requestId
  const worker = getEstimateWorker()

  const promise = new Promise<EstimateFileSizeResult>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject })
    worker.postMessage({
      id,
      inputPath,
      originalSize,
      formats,
      quality,
      resizeWidth,
      resizeHeight,
    })
  })

  return { promise, id }
}

/**
 * Cancel a pending estimation request
 */
export function cancelEstimation(id: number): void {
  const pending = pendingRequests.get(id)
  if (pending) {
    pendingRequests.delete(id)
    // Resolve with empty result instead of rejecting to avoid unhandled rejections
    pending.resolve({ success: false, error: 'Cancelled' })
  }
}

function shouldUseFFI(): boolean {
  return Bun.env.MAGICK_USE_FFI !== 'false'
}

interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validate that resize dimensions don't upscale the image
 */
export async function validateResize(
  inputPath: string,
  resizeWidth: number | null,
  resizeHeight: number | null
): Promise<ValidationResult> {
  // If no resize requested, it's valid
  if (resizeWidth === null && resizeHeight === null) {
    return { valid: true }
  }

  const dimensions = await getImageDimensions(inputPath)
  if (!dimensions) {
    return { valid: false, error: 'Could not read image dimensions' }
  }

  const { width, height } = dimensions

  if (resizeWidth !== null && resizeWidth > width) {
    return {
      valid: false,
      error: `Cannot upscale width: ${width}px to ${resizeWidth}px. Only downscaling is allowed.`,
    }
  }

  if (resizeHeight !== null && resizeHeight > height) {
    return {
      valid: false,
      error: `Cannot upscale height: ${height}px to ${resizeHeight}px. Only downscaling is allowed.`,
    }
  }

  return { valid: true }
}

/**
 * Convert a single image to a specific format using shell
 */
async function convertToFormatShell(
  inputPath: string,
  format: OutputFormat,
  quality: number,
  resizeWidth: number | null,
  resizeHeight: number | null
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  const outputPath = generateOutputPath(inputPath, format)
  const args = buildMagickArgs(inputPath, outputPath, quality, resizeWidth, resizeHeight)

  try {
    const proc = Bun.spawn(['magick', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stderr = await new Response(proc.stderr).text()
    await proc.exited

    if (proc.exitCode !== 0) {
      return {
        success: false,
        error: stderr.trim() || `ImageMagick exited with code ${proc.exitCode}`,
      }
    }

    return { success: true, outputPath }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

/**
 * Convert a single image to a specific format using FFI
 */
function convertToFormatFFI(
  inputPath: string,
  format: OutputFormat,
  quality: number,
  resizeWidth: number | null,
  resizeHeight: number | null
): { success: boolean; outputPath?: string; error?: string } {
  const outputPath = generateOutputPath(inputPath, format)
  const magick = getMagickFFI()

  return magick.convertImage({
    inputPath,
    format,
    quality,
    resizeWidth,
    resizeHeight,
    outputPath,
  })
}

/**
 * Convert a single image to a specific format
 * Uses FFI by default, falls back to shell on failure
 */
async function convertToFormat(
  inputPath: string,
  format: OutputFormat,
  quality: number,
  resizeWidth: number | null,
  resizeHeight: number | null
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  // Try FFI first if enabled and available
  if (shouldUseFFI() && isFFIAvailable()) {
    try {
      debugLog('Using FFI for conversion')
      const result = convertToFormatFFI(inputPath, format, quality, resizeWidth, resizeHeight)

      if (result.success) {
        return result
      }

      debugLog('FFI conversion failed:', result.error)
      console.warn('[MagickFFI] Conversion failed, falling back to shell:', result.error)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      debugLog('FFI exception, falling back to shell:', message)
      console.warn('[MagickFFI] Exception occurred, falling back to shell:', message)
    }
  }

  debugLog('Using shell for conversion')
  return convertToFormatShell(inputPath, format, quality, resizeWidth, resizeHeight)
}

/**
 * Process an image with the given options
 */
export async function processImage(
  options: ProcessOptions,
  onProgress?: (message: string) => void
): Promise<ProcessResult> {
  const { inputPath, outputFormats, quality, resizeWidth, resizeHeight } = options

  // Validate resize dimensions
  const validation = await validateResize(inputPath, resizeWidth, resizeHeight)
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }

  const outputPaths: string[] = []
  const errors: string[] = []

  for (const format of outputFormats) {
    onProgress?.(`Converting to ${format.toUpperCase()}...`)

    const result = await convertToFormat(
      inputPath,
      format,
      quality,
      resizeWidth,
      resizeHeight
    )

    if (result.success && result.outputPath) {
      outputPaths.push(result.outputPath)
    } else if (result.error) {
      errors.push(`${format.toUpperCase()}: ${result.error}`)
    }
  }

  if (outputPaths.length === 0) {
    return {
      success: false,
      error: errors.join('\n') || 'No images were converted',
    }
  }

  if (errors.length > 0) {
    // Partial success
    return {
      success: true,
      outputPaths,
      error: `Some conversions failed:\n${errors.join('\n')}`,
    }
  }

  return { success: true, outputPaths }
}

/**
 * Get a human-readable description of the processing options
 */
export function describeProcessing(options: ProcessOptions): string {
  const parts: string[] = []

  parts.push(`Quality: ${options.quality}%`)

  if (options.resizeWidth || options.resizeHeight) {
    const w = options.resizeWidth ? `${options.resizeWidth}px` : 'auto'
    const h = options.resizeHeight ? `${options.resizeHeight}px` : 'auto'
    parts.push(`Resize: ${w} x ${h}`)
  }

  parts.push(`Formats: ${options.outputFormats.map((f) => f.toUpperCase()).join(', ')}`)

  return parts.join(' | ')
}
