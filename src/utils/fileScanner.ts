// File scanning utilities for finding and analyzing image files

import { readdir, stat } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import { existsSync } from 'node:fs'
import type { ImageFile, ImageDimensions } from './types'
import { SUPPORTED_INPUT_FORMATS } from '../constants'
import { getMagickFFI, isFFIAvailable, shouldSwapDimensions } from './magickFFI'

// Feature flag: default to true (FFI enabled), can be disabled with MAGICK_USE_FFI=false
function useFFI(): boolean {
  return Bun.env.MAGICK_USE_FFI !== 'false'
}

/**
 * Check if a file is a supported image format
 */
export function isImageFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase()
  return SUPPORTED_INPUT_FORMATS.includes(ext)
}

/**
 * Get image dimensions using shell command (original implementation)
 * Accounts for EXIF orientation to return the displayed dimensions
 */
async function getImageDimensionsShell(
  imagePath: string
): Promise<ImageDimensions | null> {
  try {
    // Get width, height, and EXIF orientation
    const proc = Bun.spawn(
      ['magick', 'identify', '-format', '%w %h %[EXIF:Orientation]', imagePath],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      }
    )

    const output = await new Response(proc.stdout).text()
    await proc.exited

    if (proc.exitCode !== 0) {
      return null
    }

    const parts = output.trim().split(' ')
    let width = parseInt(parts[0] ?? '0', 10)
    let height = parseInt(parts[1] ?? '0', 10)
    const orientation = parseInt(parts[2] ?? '1', 10)

    if (isNaN(width) || isNaN(height)) {
      return null
    }

    // Swap dimensions if orientation indicates 90/270 degree rotation
    if (shouldSwapDimensions(orientation)) {
      ;[width, height] = [height, width]
    }

    return { width, height }
  } catch {
    return null
  }
}

/**
 * Get image dimensions using FFI
 * Accounts for EXIF orientation to return the displayed dimensions
 */
function getImageDimensionsFFI(imagePath: string): ImageDimensions | null {
  const magick = getMagickFFI()
  return magick.getImageDimensions(imagePath)
}

/**
 * Get image dimensions using ImageMagick
 * Uses FFI by default, falls back to shell on failure
 * Accounts for EXIF orientation to return the displayed dimensions
 */
export async function getImageDimensions(
  imagePath: string
): Promise<ImageDimensions | null> {
  const shouldUseFFI = useFFI()

  if (shouldUseFFI) {
    try {
      // Check if FFI is available before attempting
      if (isFFIAvailable()) {
        const result = getImageDimensionsFFI(imagePath)

        // If FFI succeeded, return result (even if null - file might not exist)
        if (result !== null) {
          return result
        }
      }
    } catch (error) {
      // FFI threw an exception, fall back to shell
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[MagickFFI] Exception occurred, falling back to shell:', message)
    }
  }

  return getImageDimensionsShell(imagePath)
}

/**
 * Scan the current directory for image files (fast - no dimensions)
 * Returns files immediately without reading dimensions
 */
export async function scanDirectory(dirPath: string): Promise<ImageFile[]> {
  try {
    const entries = await readdir(dirPath)

    // Filter to only image files first
    const imageEntries = entries.filter(isImageFile)

    // Get stats in parallel (fast)
    const results = await Promise.all(
      imageEntries.map(async (entry) => {
        const fullPath = join(dirPath, entry)

        try {
          const fileStat = await stat(fullPath)
          if (!fileStat.isFile()) return null

          return {
            name: entry,
            path: fullPath,
            size: fileStat.size,
            width: 0, // Will be loaded async
            height: 0, // Will be loaded async
            format: extname(entry).toLowerCase().slice(1),
          } as ImageFile
        } catch {
          return null
        }
      })
    )

    // Filter out nulls and sort by name
    return results
      .filter((f): f is ImageFile => f !== null)
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Error scanning directory:', error)
    return []
  }
}

/**
 * Small delay to yield control back to the event loop
 */
function yieldToUI(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

/**
 * Load dimensions for files asynchronously, calling onUpdate for each file
 * Yields to the event loop between files to allow UI updates
 */
export async function loadDimensionsAsync(
  files: ImageFile[],
  onUpdate: (index: number, dimensions: ImageDimensions) => void
): Promise<void> {
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (!file) continue
    
    // Yield to allow UI to render
    await yieldToUI()
    
    try {
      const dimensions = await getImageDimensions(file.path)
      if (dimensions) {
        onUpdate(i, dimensions)
      }
    } catch {
      // Skip files we can't read dimensions for
    }
  }
}

/**
 * Generate a unique output path with counter suffix if file exists
 */
export function generateOutputPath(
  inputPath: string,
  format: string
): string {
  const dir = inputPath.substring(0, inputPath.lastIndexOf('/'))
  const inputName = basename(inputPath)
  const baseName = inputName.substring(0, inputName.lastIndexOf('.'))

  let counter = 0
  let outputPath = join(dir, `${baseName}.${format}`)

  while (existsSync(outputPath)) {
    counter++
    outputPath = join(dir, `${baseName}-${counter}.${format}`)
  }

  return outputPath
}

/**
 * Check if ImageMagick is installed
 */
export async function checkImageMagick(): Promise<boolean> {
  try {
    const proc = Bun.spawn(['magick', '-version'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    await proc.exited
    return proc.exitCode === 0
  } catch {
    return false
  }
}

/**
 * Estimate available disk space (simplified - checks if we can write)
 */
export async function checkDiskSpace(dirPath: string): Promise<boolean> {
  try {
    const testFile = join(dirPath, '.magick-tui-test')
    await Bun.write(testFile, 'test')
    const { unlink } = await import('node:fs/promises')
    await unlink(testFile)
    return true
  } catch {
    return false
  }
}
