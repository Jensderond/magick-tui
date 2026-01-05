// File scanning utilities for finding and analyzing image files

import { readdir, stat } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import { existsSync } from 'node:fs'
import type { ImageFile, ImageDimensions } from './types'
import { SUPPORTED_INPUT_FORMATS } from '../constants'

/**
 * Check if a file is a supported image format
 */
export function isImageFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase()
  return SUPPORTED_INPUT_FORMATS.includes(ext)
}

/**
 * Check if EXIF orientation requires swapping width/height
 * Orientations 5, 6, 7, 8 involve 90-degree rotations
 */
function shouldSwapDimensions(orientation: number): boolean {
  return orientation >= 5 && orientation <= 8
}

/**
 * Get image dimensions using ImageMagick identify command
 * Accounts for EXIF orientation to return the displayed dimensions
 */
export async function getImageDimensions(
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
 * Scan the current directory for image files
 */
export async function scanDirectory(dirPath: string): Promise<ImageFile[]> {
  const imageFiles: ImageFile[] = []

  try {
    const entries = await readdir(dirPath)

    for (const entry of entries) {
      if (!isImageFile(entry)) continue

      const fullPath = join(dirPath, entry)

      try {
        const fileStat = await stat(fullPath)
        if (!fileStat.isFile()) continue

        // Get image dimensions
        const dimensions = await getImageDimensions(fullPath)

        imageFiles.push({
          name: entry,
          path: fullPath,
          size: fileStat.size,
          width: dimensions?.width ?? 0,
          height: dimensions?.height ?? 0,
          format: extname(entry).toLowerCase().slice(1),
        })
      } catch {
        // Skip files we can't read
        continue
      }
    }
  } catch (error) {
    console.error('Error scanning directory:', error)
  }

  // Sort by name
  return imageFiles.sort((a, b) => a.name.localeCompare(b.name))
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
