/**
 * MagickWand FFI Bindings for ImageMagick
 *
 * This module provides direct FFI bindings to libMagickWand for improved performance
 * over shell execution of the `magick` CLI.
 *
 * @module magickFFI
 */

import { dlopen, FFIType, CString, ptr, type Pointer } from 'bun:ffi'
import type { ImageDimensions, OutputFormat } from './types'

// Debug logging
const DEBUG = Bun.env.DEBUG?.includes('magick') ?? false

function debugLog(message: string, ...args: unknown[]): void {
  if (DEBUG) {
    console.log(`[MagickFFI] ${message}`, ...args)
  }
}

/**
 * EXIF Orientation values as defined by the EXIF standard
 */
export enum OrientationType {
  UndefinedOrientation = 0,
  TopLeftOrientation = 1, // Normal
  TopRightOrientation = 2, // Flip horizontal
  BottomRightOrientation = 3, // Rotate 180
  BottomLeftOrientation = 4, // Flip vertical
  LeftTopOrientation = 5, // Rotate 90 CW + flip horizontal
  RightTopOrientation = 6, // Rotate 90 CW
  RightBottomOrientation = 7, // Rotate 90 CCW + flip horizontal
  LeftBottomOrientation = 8, // Rotate 90 CCW
}

/**
 * Filter types for image resizing
 * Using LanczosFilter (22) for high-quality resizing
 */
export enum FilterType {
  UndefinedFilter = 0,
  PointFilter = 1,
  BoxFilter = 2,
  TriangleFilter = 3,
  HermiteFilter = 4,
  HannFilter = 5,
  HammingFilter = 6,
  BlackmanFilter = 7,
  GaussianFilter = 8,
  QuadraticFilter = 9,
  CubicFilter = 10,
  CatromFilter = 11,
  MitchellFilter = 12,
  JincFilter = 13,
  SincFilter = 14,
  SincFastFilter = 15,
  KaiserFilter = 16,
  WelchFilter = 17,
  ParzenFilter = 18,
  BohmanFilter = 19,
  BartlettFilter = 20,
  LagrangeFilter = 21,
  LanczosFilter = 22, // Recommended for quality
  LanczosSharpFilter = 23,
  Lanczos2Filter = 24,
  Lanczos2SharpFilter = 25,
  RobidouxFilter = 26,
  RobidouxSharpFilter = 27,
  CosineFilter = 28,
  SplineFilter = 29,
  LanczosRadiusFilter = 30,
}

/**
 * Options for image conversion
 */
export interface ConvertOptions {
  inputPath: string
  format: OutputFormat
  quality: number
  resizeWidth?: number | null
  resizeHeight?: number | null
  outputPath: string
}

/**
 * Options for file size estimation (no output path needed)
 */
export interface EstimateOptions {
  inputPath: string
  format: OutputFormat
  quality: number
  resizeWidth?: number | null
  resizeHeight?: number | null
}

/**
 * Result of a file size estimation
 */
export interface EstimateResult {
  success: boolean
  estimatedSize?: number // Size in bytes
  error?: string
}

/**
 * Result of an image conversion operation
 */
export interface ConvertResult {
  success: boolean
  outputPath?: string
  error?: string
}

/**
 * Configuration for the MagickFFI instance
 */
export interface MagickFFIConfig {
  libraryPath?: string
}

// Symbol definitions for dlopen
const MAGICK_SYMBOLS = {
  // Lifecycle
  MagickWandGenesis: {
    args: [] as const,
    returns: FFIType.void,
  },
  MagickWandTerminus: {
    args: [] as const,
    returns: FFIType.void,
  },

  // Wand management
  NewMagickWand: {
    args: [] as const,
    returns: FFIType.ptr,
  },
  DestroyMagickWand: {
    args: [FFIType.ptr] as const,
    returns: FFIType.ptr,
  },
  ClearMagickWand: {
    args: [FFIType.ptr] as const,
    returns: FFIType.void,
  },

  // Image I/O
  MagickReadImage: {
    args: [FFIType.ptr, FFIType.ptr] as const,
    returns: FFIType.bool,
  },
  MagickWriteImage: {
    args: [FFIType.ptr, FFIType.ptr] as const,
    returns: FFIType.bool,
  },

  // Image properties
  MagickGetImageWidth: {
    args: [FFIType.ptr] as const,
    returns: FFIType.u64,
  },
  MagickGetImageHeight: {
    args: [FFIType.ptr] as const,
    returns: FFIType.u64,
  },
  MagickGetImageOrientation: {
    args: [FFIType.ptr] as const,
    returns: FFIType.i32,
  },

  // Image operations
  MagickAutoOrientImage: {
    args: [FFIType.ptr] as const,
    returns: FFIType.bool,
  },
  MagickStripImage: {
    args: [FFIType.ptr] as const,
    returns: FFIType.bool,
  },
  MagickSetImageCompressionQuality: {
    args: [FFIType.ptr, FFIType.u64] as const,
    returns: FFIType.bool,
  },
  MagickResizeImage: {
    args: [FFIType.ptr, FFIType.u64, FFIType.u64, FFIType.i32] as const,
    returns: FFIType.bool,
  },
  MagickSetImageFormat: {
    args: [FFIType.ptr, FFIType.ptr] as const,
    returns: FFIType.bool,
  },

  // Blob operations (for in-memory conversion)
  MagickGetImageBlob: {
    args: [FFIType.ptr, FFIType.ptr] as const, // (wand, &length) -> blob ptr
    returns: FFIType.ptr,
  },

  // Error handling
  MagickGetException: {
    args: [FFIType.ptr, FFIType.ptr] as const,
    returns: FFIType.ptr,
  },
  MagickRelinquishMemory: {
    args: [FFIType.ptr] as const,
    returns: FFIType.ptr,
  },
} as const

type MagickLib = ReturnType<typeof dlopen<typeof MAGICK_SYMBOLS>>

/**
 * Platform-specific library paths for libMagickWand
 */
function getPlatformLibraryPath(): string {
  // Check for environment override first
  const envPath = Bun.env.MAGICK_WAND_LIBRARY_PATH
  if (envPath) {
    debugLog('Using environment library path:', envPath)
    return envPath
  }

  const platform = process.platform
  const arch = process.arch

  if (platform === 'darwin') {
    // macOS paths
    if (arch === 'arm64') {
      // Apple Silicon (Homebrew default location)
      return '/opt/homebrew/lib/libMagickWand-7.Q16HDRI.dylib'
    } else {
      // Intel Mac (Homebrew default location)
      return '/usr/local/lib/libMagickWand-7.Q16HDRI.dylib'
    }
  } else if (platform === 'linux') {
    // Linux paths - try multiple locations (ImageMagick 7 first, then 6)
    const linuxPaths = [
      // ImageMagick 7
      '/usr/lib/x86_64-linux-gnu/libMagickWand-7.Q16HDRI.so',
      '/usr/lib/x86_64-linux-gnu/libMagickWand-7.Q16HDRI.so.10',
      '/usr/lib/libMagickWand-7.Q16HDRI.so',
      '/usr/local/lib/libMagickWand-7.Q16HDRI.so',
      // ImageMagick 6 (Ubuntu default)
      '/usr/lib/x86_64-linux-gnu/libMagickWand-6.Q16.so',
      '/usr/lib/x86_64-linux-gnu/libMagickWand-6.Q16.so.6',
      '/usr/lib/libMagickWand-6.Q16.so',
    ]

    for (const libPath of linuxPaths) {
      try {
        const file = Bun.file(libPath)
        // Check if file exists by checking size
        if (file.size > 0) {
          debugLog('Found library at:', libPath)
          return libPath
        }
      } catch {
        // Continue searching
      }
    }

    // If nothing found, return the most common path and let dlopen fail with a proper error
    return '/usr/lib/x86_64-linux-gnu/libMagickWand-6.Q16.so'
  }

  throw new Error(`Unsupported platform: ${platform}/${arch}`)
}

/**
 * Convert a JavaScript string to a null-terminated C string (Uint8Array)
 */
function toCString(str: string): Uint8Array {
  const encoder = new TextEncoder()
  const encoded = encoder.encode(str)
  const buffer = new Uint8Array(encoded.length + 1)
  buffer.set(encoded)
  buffer[encoded.length] = 0 // Null terminator
  return buffer
}

/**
 * Check if EXIF orientation requires swapping width/height
 * Orientations 5-8 involve 90-degree rotations that swap dimensions
 */
export function shouldSwapDimensions(orientation: number): boolean {
  return orientation >= 5 && orientation <= 8
}

/**
 * MagickFFI class - handles FFI bindings to libMagickWand
 */
export class MagickFFI {
  private lib: MagickLib | null = null
  private initialized = false

  constructor(private config: MagickFFIConfig = {}) {}

  /**
   * Initialize the FFI library and MagickWand environment
   */
  init(): void {
    if (this.initialized) {
      debugLog('Already initialized')
      return
    }

    const libraryPath = this.config.libraryPath ?? getPlatformLibraryPath()
    debugLog('Loading library from:', libraryPath)

    try {
      this.lib = dlopen(libraryPath, MAGICK_SYMBOLS)

      // Initialize MagickWand
      this.lib.symbols.MagickWandGenesis()
      this.initialized = true
      debugLog('MagickWand initialized successfully')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to load MagickWand library: ${message}`)
    }
  }

  /**
   * Cleanup MagickWand environment
   */
  cleanup(): void {
    if (this.lib && this.initialized) {
      debugLog('Cleaning up MagickWand')
      this.lib.symbols.MagickWandTerminus()
      this.initialized = false
    }
  }

  /**
   * Check if the FFI is initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Create a new MagickWand and return its pointer
   */
  private createWand(): Pointer {
    if (!this.lib) {
      throw new Error('MagickFFI not initialized')
    }
    const wand = this.lib.symbols.NewMagickWand()
    if (!wand) {
      throw new Error('Failed to create MagickWand')
    }
    debugLog('Created wand:', wand)
    return wand
  }

  /**
   * Destroy a MagickWand
   */
  private destroyWand(wand: Pointer): void {
    if (this.lib && wand) {
      debugLog('Destroying wand:', wand)
      this.lib.symbols.DestroyMagickWand(wand)
    }
  }

  /**
   * Get exception message from a wand
   */
  private getException(wand: Pointer): string | null {
    if (!this.lib) return null

    const severity = new Uint32Array(1)
    const descPtr = this.lib.symbols.MagickGetException(wand, severity)

    if (!descPtr) return null

    try {
      const message = new CString(descPtr)
      const result = message.toString()
      this.lib.symbols.MagickRelinquishMemory(descPtr)
      return result || null
    } catch {
      return null
    }
  }

  /**
   * Get image dimensions from a file
   * Accounts for EXIF orientation to return displayed dimensions
   */
  getImageDimensions(imagePath: string): ImageDimensions | null {
    if (!this.lib) {
      throw new Error('MagickFFI not initialized')
    }

    const wand = this.createWand()
    try {
      const pathCStr = toCString(imagePath)

      // Read the image - pass TypedArray directly
      const readResult = this.lib.symbols.MagickReadImage(wand, pathCStr)
      if (!readResult) {
        const error = this.getException(wand)
        debugLog('Failed to read image:', error)
        return null
      }

      // Get raw dimensions
      let width = Number(this.lib.symbols.MagickGetImageWidth(wand))
      let height = Number(this.lib.symbols.MagickGetImageHeight(wand))
      const orientation = this.lib.symbols.MagickGetImageOrientation(wand)

      debugLog(
        `Image dimensions: ${width}x${height}, orientation: ${orientation}`
      )

      // Swap dimensions if orientation indicates 90/270 degree rotation
      if (shouldSwapDimensions(orientation)) {
        debugLog('Swapping dimensions due to orientation')
        ;[width, height] = [height, width]
      }

      return { width, height }
    } finally {
      this.destroyWand(wand)
    }
  }

  /**
   * Convert an image to a different format with optional resizing
   */
  convertImage(options: ConvertOptions): ConvertResult {
    if (!this.lib) {
      throw new Error('MagickFFI not initialized')
    }

    const { inputPath, format, quality, resizeWidth, resizeHeight, outputPath } =
      options

    debugLog('Converting image:', {
      inputPath,
      format,
      quality,
      resizeWidth,
      resizeHeight,
      outputPath,
    })

    const wand = this.createWand()
    try {
      const inputCStr = toCString(inputPath)

      // Read input image - pass TypedArray directly
      const readResult = this.lib.symbols.MagickReadImage(wand, inputCStr)
      if (!readResult) {
        const error = this.getException(wand)
        return {
          success: false,
          error: error ?? 'Failed to read input image',
        }
      }

      // Auto-orient based on EXIF data
      const orientResult = this.lib.symbols.MagickAutoOrientImage(wand)
      if (!orientResult) {
        debugLog('Warning: Auto-orient failed')
      }

      // Strip metadata
      const stripResult = this.lib.symbols.MagickStripImage(wand)
      if (!stripResult) {
        debugLog('Warning: Strip metadata failed')
      }

      // Set quality
      const qualityResult = this.lib.symbols.MagickSetImageCompressionQuality(
        wand,
        quality
      )
      if (!qualityResult) {
        debugLog('Warning: Set quality failed')
      }

      // Resize if specified
      if (resizeWidth || resizeHeight) {
        // Get current dimensions
        const currentWidth = Number(this.lib.symbols.MagickGetImageWidth(wand))
        const currentHeight = Number(this.lib.symbols.MagickGetImageHeight(wand))

        // Calculate target dimensions maintaining aspect ratio
        let targetWidth = resizeWidth ?? 0
        let targetHeight = resizeHeight ?? 0

        if (targetWidth && !targetHeight) {
          // Width specified, calculate height maintaining aspect ratio
          targetHeight = Math.round(
            (currentHeight * targetWidth) / currentWidth
          )
        } else if (targetHeight && !targetWidth) {
          // Height specified, calculate width maintaining aspect ratio
          targetWidth = Math.round(
            (currentWidth * targetHeight) / currentHeight
          )
        }

        // Only resize if we're shrinking (not enlarging)
        if (targetWidth <= currentWidth && targetHeight <= currentHeight) {
          debugLog(`Resizing to ${targetWidth}x${targetHeight}`)
          const resizeResult = this.lib.symbols.MagickResizeImage(
            wand,
            targetWidth,
            targetHeight,
            FilterType.LanczosFilter
          )
          if (!resizeResult) {
            const error = this.getException(wand)
            return {
              success: false,
              error: error ?? 'Failed to resize image',
            }
          }
        } else {
          debugLog(
            'Skipping resize: target dimensions larger than current dimensions'
          )
        }
      }

      // Set output format - pass TypedArray directly
      const formatCStr = toCString(format.toUpperCase())
      const formatResult = this.lib.symbols.MagickSetImageFormat(
        wand,
        formatCStr
      )
      if (!formatResult) {
        const error = this.getException(wand)
        return {
          success: false,
          error: error ?? `Failed to set format to ${format}`,
        }
      }

      // Write output image - pass TypedArray directly
      const outputCStr = toCString(outputPath)
      const writeResult = this.lib.symbols.MagickWriteImage(wand, outputCStr)
      if (!writeResult) {
        const error = this.getException(wand)
        return {
          success: false,
          error: error ?? 'Failed to write output image',
        }
      }

      debugLog('Conversion successful:', outputPath)
      return {
        success: true,
        outputPath,
      }
    } finally {
      this.destroyWand(wand)
    }
  }

  /**
   * Estimate the output file size without writing to disk
   * Uses MagickGetImageBlob to get the compressed data in memory
   */
  estimateFileSize(options: EstimateOptions): EstimateResult {
    if (!this.lib) {
      throw new Error('MagickFFI not initialized')
    }

    const { inputPath, format, quality, resizeWidth, resizeHeight } = options

    debugLog('Estimating file size:', {
      inputPath,
      format,
      quality,
      resizeWidth,
      resizeHeight,
    })

    const wand = this.createWand()
    try {
      const inputCStr = toCString(inputPath)

      // Read input image
      const readResult = this.lib.symbols.MagickReadImage(wand, inputCStr)
      if (!readResult) {
        const error = this.getException(wand)
        return {
          success: false,
          error: error ?? 'Failed to read input image',
        }
      }

      // Auto-orient based on EXIF data
      this.lib.symbols.MagickAutoOrientImage(wand)

      // Strip metadata
      this.lib.symbols.MagickStripImage(wand)

      // Set quality
      this.lib.symbols.MagickSetImageCompressionQuality(wand, quality)

      // Resize if specified
      if (resizeWidth || resizeHeight) {
        const currentWidth = Number(this.lib.symbols.MagickGetImageWidth(wand))
        const currentHeight = Number(this.lib.symbols.MagickGetImageHeight(wand))

        let targetWidth = resizeWidth ?? 0
        let targetHeight = resizeHeight ?? 0

        if (targetWidth && !targetHeight) {
          targetHeight = Math.round((currentHeight * targetWidth) / currentWidth)
        } else if (targetHeight && !targetWidth) {
          targetWidth = Math.round((currentWidth * targetHeight) / currentHeight)
        }

        if (targetWidth <= currentWidth && targetHeight <= currentHeight) {
          this.lib.symbols.MagickResizeImage(
            wand,
            targetWidth,
            targetHeight,
            FilterType.LanczosFilter
          )
        }
      }

      // Set output format
      const formatCStr = toCString(format.toUpperCase())
      const formatResult = this.lib.symbols.MagickSetImageFormat(wand, formatCStr)
      if (!formatResult) {
        const error = this.getException(wand)
        return {
          success: false,
          error: error ?? `Failed to set format to ${format}`,
        }
      }

      // Get the image as a blob (in memory, no disk write)
      const lengthBuffer = new BigUint64Array(1)
      const blobPtr = this.lib.symbols.MagickGetImageBlob(wand, lengthBuffer)

      if (!blobPtr) {
        const error = this.getException(wand)
        return {
          success: false,
          error: error ?? 'Failed to get image blob',
        }
      }

      const estimatedSize = Number(lengthBuffer[0])
      debugLog('Estimated size:', estimatedSize, 'bytes')

      // Free the blob memory
      this.lib.symbols.MagickRelinquishMemory(blobPtr)

      return {
        success: true,
        estimatedSize,
      }
    } finally {
      this.destroyWand(wand)
    }
  }
}

// Singleton instance
let magickFFIInstance: MagickFFI | null = null
let initError: Error | null = null

/**
 * Get the singleton MagickFFI instance
 * The instance is lazily initialized on first call
 */
export function getMagickFFI(): MagickFFI {
  if (initError) {
    throw initError
  }

  if (!magickFFIInstance) {
    magickFFIInstance = new MagickFFI()
    try {
      magickFFIInstance.init()

      // Register cleanup on process exit
      process.on('exit', () => {
        magickFFIInstance?.cleanup()
      })

      // Also handle signals
      process.on('SIGINT', () => {
        magickFFIInstance?.cleanup()
        process.exit(0)
      })

      process.on('SIGTERM', () => {
        magickFFIInstance?.cleanup()
        process.exit(0)
      })
    } catch (error) {
      initError = error instanceof Error ? error : new Error(String(error))
      magickFFIInstance = null
      throw initError
    }
  }

  return magickFFIInstance
}

/**
 * Check if FFI is available on the current platform
 * Returns true if the library can be loaded, false otherwise
 */
export function isFFIAvailable(): boolean {
  try {
    getMagickFFI()
    return true
  } catch {
    return false
  }
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetMagickFFI(): void {
  if (magickFFIInstance) {
    magickFFIInstance.cleanup()
    magickFFIInstance = null
  }
  initError = null
}
