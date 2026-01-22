/**
 * Web Worker for file size estimation
 * Runs estimation in a separate thread to avoid blocking the main UI thread
 */

import { getMagickFFI, isFFIAvailable } from './magickFFI'
import { estimateFileSizeWithTempFile, calculateDecreasePercent } from './magickShared'
import type { OutputFormat } from './types'

export interface EstimateRequest {
  id: number
  inputPath: string
  originalSize: number
  formats: OutputFormat[]
  quality: number
  resizeWidth: number | null
  resizeHeight: number | null
}

export interface EstimateResponse {
  id: number
  success: boolean
  estimates?: Array<{
    format: OutputFormat
    estimatedSize: number
    originalSize: number
    decreasePercent: number
  }>
  error?: string
}

/**
 * Estimate file size for a single format, using FFI with shell fallback
 */
async function estimateForFormat(
  inputPath: string,
  format: OutputFormat,
  quality: number,
  resizeWidth: number | null,
  resizeHeight: number | null,
  useFFI: boolean
): Promise<number | undefined> {
  // Try FFI first if enabled
  if (useFFI && isFFIAvailable()) {
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
        return result.estimatedSize
      }
    } catch {
      // Fall through to shell
    }
  }

  // Fallback to shell
  const shellResult = await estimateFileSizeWithTempFile(
    inputPath,
    format,
    quality,
    resizeWidth,
    resizeHeight
  )

  if (shellResult.success && shellResult.estimatedSize !== undefined) {
    return shellResult.estimatedSize
  }

  return undefined
}

/**
 * Process estimation request for all formats
 */
async function processEstimation(request: EstimateRequest): Promise<EstimateResponse> {
  const { id, inputPath, originalSize, formats, quality, resizeWidth, resizeHeight } = request
  const useFFI = Bun.env.MAGICK_USE_FFI !== 'false'
  const estimates: EstimateResponse['estimates'] = []

  for (const format of formats) {
    const estimatedSize = await estimateForFormat(
      inputPath,
      format,
      quality,
      resizeWidth,
      resizeHeight,
      useFFI
    )

    if (estimatedSize !== undefined) {
      estimates.push({
        format,
        estimatedSize,
        originalSize,
        decreasePercent: calculateDecreasePercent(originalSize, estimatedSize),
      })
    }
  }

  if (estimates.length === 0) {
    return { id, success: false, error: 'Could not estimate file sizes' }
  }

  return { id, success: true, estimates }
}

// Worker message handler
declare const self: Worker

self.onmessage = async (event: MessageEvent<EstimateRequest>) => {
  const response = await processEstimation(event.data)
  self.postMessage(response)
}
