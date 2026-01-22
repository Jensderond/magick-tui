/**
 * Web Worker for file size estimation
 * Runs estimation in a separate thread to avoid blocking the main UI thread
 */

import { getMagickFFI, isFFIAvailable } from './magickFFI'
import { unlink } from 'node:fs/promises'
import type { OutputFormat } from './types'

interface EstimateRequest {
  id: number
  inputPath: string
  originalSize: number
  formats: OutputFormat[]
  quality: number
  resizeWidth: number | null
  resizeHeight: number | null
}

interface EstimateResponse {
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
 * Build ImageMagick arguments for shell estimation
 */
function buildMagickArgs(
  inputPath: string,
  outputPath: string,
  quality: number,
  resizeWidth: number | null,
  resizeHeight: number | null
): string[] {
  const args: string[] = [inputPath]
  args.push('-auto-orient')
  args.push('-strip')
  args.push('-quality', quality.toString())

  if (resizeWidth !== null || resizeHeight !== null) {
    const widthStr = resizeWidth !== null ? resizeWidth.toString() : ''
    const heightStr = resizeHeight !== null ? resizeHeight.toString() : ''
    args.push('-resize', `${widthStr}x${heightStr}>`)
  }

  args.push(outputPath)
  return args
}

/**
 * Estimate file size using shell (with temp file)
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

    const tempFile = Bun.file(tempPath)
    const estimatedSize = tempFile.size

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
 * Process estimation request
 */
async function processEstimation(request: EstimateRequest): Promise<EstimateResponse> {
  const { id, inputPath, originalSize, formats, quality, resizeWidth, resizeHeight } = request
  const estimates: EstimateResponse['estimates'] = []

  const useFFI = Bun.env.MAGICK_USE_FFI !== 'false'

  for (const format of formats) {
    let estimatedSize: number | undefined

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
          estimatedSize = result.estimatedSize
        }
      } catch {
        // Fall through to shell
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
