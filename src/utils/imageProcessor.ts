// ImageMagick processing utilities

import type { ProcessOptions, ProcessResult, OutputFormat } from './types'
import { generateOutputPath, getImageDimensions } from './fileScanner'

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
 * Convert a single image to a specific format
 */
async function convertToFormat(
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
