// Shared ImageMagick utilities used by both main thread and worker
// This file contains pure functions with no dependencies on worker-specific or main-thread-specific APIs

import { unlink } from 'node:fs/promises'
import type { OutputFormat } from './types'

/**
 * Build ImageMagick command arguments for conversion/estimation
 */
export function buildMagickArgs(
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
    args.push('-resize', `${widthStr}x${heightStr}>`)
  }

  args.push(outputPath)

  return args
}

/**
 * Estimate file size by converting to a temp file and measuring
 */
export async function estimateFileSizeWithTempFile(
  inputPath: string,
  format: OutputFormat,
  quality: number,
  resizeWidth: number | null,
  resizeHeight: number | null
): Promise<{ success: boolean; estimatedSize?: number; error?: string }> {
  const tempPath = `/tmp/magick-estimate-${crypto.randomUUID()}.${format}`
  const args = buildMagickArgs(inputPath, tempPath, quality, resizeWidth, resizeHeight)

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

  // Clean up temp file (ignore errors)
  try {
    await unlink(tempPath)
  } catch {
    // Ignore cleanup errors
  }

  return { success: true, estimatedSize }
}

/**
 * Calculate the percentage decrease from original to estimated size
 */
export function calculateDecreasePercent(originalSize: number, estimatedSize: number): number {
  return Math.round(((originalSize - estimatedSize) / originalSize) * 100)
}
