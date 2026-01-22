// ImageMagick processing utilities

import { unlink } from 'node:fs/promises'
import type { ProcessOptions, ProcessResult, OutputFormat } from './types'
import { generateOutputPath, getImageDimensions } from './fileScanner'
import { getMagickFFI, isFFIAvailable } from './magickFFI'

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

// Feature flag: default to true (FFI enabled), can be disabled with MAGICK_USE_FFI=false
function useFFI(): boolean {
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
 * Build the ImageMagick command arguments
 */
function buildMagickArgs(
  inputPath: string,
  outputPath: string,
  quality: number,
  resizeWidth: number | null,
  resizeHeight: number | null
): string[] {
  const args: string[] = [inputPath]

  // Auto-orient based on EXIF data (preserves orientation)
  args.push('-auto-orient')

  // Strip metadata for smaller file size
  args.push('-strip')

  // Set quality
  args.push('-quality', quality.toString())

  // Add resize if specified (with > flag to only shrink, never enlarge)
  if (resizeWidth !== null || resizeHeight !== null) {
    const widthStr = resizeWidth !== null ? resizeWidth.toString() : ''
    const heightStr = resizeHeight !== null ? resizeHeight.toString() : ''
    // The > flag ensures we only shrink, never enlarge
    args.push('-resize', `${widthStr}x${heightStr}>`)
  }

  args.push(outputPath)

  return args
}

/**
 * Convert a single image to a specific format using shell (original implementation)
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
  const shouldUseFFI = useFFI()

  if (shouldUseFFI) {
    try {
      // Check if FFI is available before attempting
      if (isFFIAvailable()) {
        debugLog('Using FFI for conversion')
        const result = convertToFormatFFI(inputPath, format, quality, resizeWidth, resizeHeight)
        
        // If FFI succeeded, return result
        if (result.success) {
          return result
        }
        
        // If FFI failed with an error, log and fall back to shell
        debugLog('FFI conversion failed:', result.error)
        console.warn('[MagickFFI] Conversion failed, falling back to shell:', result.error)
      }
    } catch (error) {
      // FFI threw an exception, fall back to shell
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

/**
 * Estimate file size using shell (with temp file)
 * Used as fallback when FFI is not available
 */
async function estimateFileSizeShell(
  inputPath: string,
  format: OutputFormat,
  quality: number,
  resizeWidth: number | null,
  resizeHeight: number | null
): Promise<{ success: boolean; estimatedSize?: number; error?: string }> {
  const tempPath = `/tmp/magick-estimate-${crypto.randomUUID()}.${format}`
  const args = buildMagickArgs(inputPath, tempPath, quality, resizeWidth, resizeHeight)

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

    // Get the size of the temp file
    const tempFile = Bun.file(tempPath)
    const estimatedSize = tempFile.size

    // Delete the temp file
    try {
      await unlink(tempPath)
    } catch {
      // Ignore cleanup errors
    }

    return { success: true, estimatedSize }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

/**
 * Estimate the output file sizes for given formats without saving files
 * Uses FFI for in-memory conversion when available, falls back to temp files
 */
export async function estimateFileSizeForFormats(
  inputPath: string,
  originalSize: number,
  formats: OutputFormat[],
  quality: number,
  resizeWidth: number | null,
  resizeHeight: number | null
): Promise<EstimateFileSizeResult> {
  const estimates: FileSizeEstimate[] = []
  const shouldUseFFI = useFFI()

  for (const format of formats) {
    let estimatedSize: number | undefined

    if (shouldUseFFI && isFFIAvailable()) {
      try {
        const magick = getMagickFFI()
        const result = magick.estimateFileSize({
          inputPath,
          format,
          quality,
          resizeWidth,
          resizeHeight,
        })

        if (result.success && result.estimatedSize !== undefined) {
          estimatedSize = result.estimatedSize
        }
      } catch (error) {
        debugLog('FFI estimation failed, falling back to shell:', error)
      }
    }

    // Fallback to shell if FFI didn't work
    if (estimatedSize === undefined) {
      const shellResult = await estimateFileSizeShell(
        inputPath,
        format,
        quality,
        resizeWidth,
        resizeHeight
      )
      if (shellResult.success && shellResult.estimatedSize !== undefined) {
        estimatedSize = shellResult.estimatedSize
      }
    }

    if (estimatedSize !== undefined) {
      const decreasePercent = Math.round(((originalSize - estimatedSize) / originalSize) * 100)
      estimates.push({
        format,
        estimatedSize,
        originalSize,
        decreasePercent,
      })
    }
  }

  if (estimates.length === 0) {
    return { success: false, error: 'Could not estimate file sizes' }
  }

  return { success: true, estimates }
}
