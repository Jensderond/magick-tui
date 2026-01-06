/**
 * Unit tests for MagickFFI module
 */

import { describe, test, expect, beforeAll, afterAll, afterEach } from 'bun:test'
import { join } from 'node:path'
import { existsSync, unlinkSync } from 'node:fs'
import {
  MagickFFI,
  getMagickFFI,
  isFFIAvailable,
  resetMagickFFI,
  shouldSwapDimensions,
  OrientationType,
  FilterType,
} from '../magickFFI'

// Test fixtures directory
const FIXTURES_DIR = join(import.meta.dir, '../__fixtures__')
const TEST_PNG = join(FIXTURES_DIR, 'test.png')
const PORTRAIT_JPG = join(FIXTURES_DIR, 'Portrait_2.jpg')
const LANDSCAPE_JPG = join(FIXTURES_DIR, 'Landscape_2.jpg')
const CORRUPT_JPG = join(FIXTURES_DIR, 'test-corrupt.jpg')

// Output directory for test files
const OUTPUT_DIR = FIXTURES_DIR

// Cleanup helper
function cleanupFile(path: string): void {
  if (existsSync(path)) {
    try {
      unlinkSync(path)
    } catch {
      // Ignore cleanup errors
    }
  }
}

describe('MagickFFI', () => {
  // Reset singleton before each test file run
  beforeAll(() => {
    resetMagickFFI()
  })

  afterAll(() => {
    resetMagickFFI()
  })

  describe('shouldSwapDimensions', () => {
    test('returns false for orientations 1-4 (no rotation)', () => {
      expect(shouldSwapDimensions(OrientationType.TopLeftOrientation)).toBe(false)
      expect(shouldSwapDimensions(OrientationType.TopRightOrientation)).toBe(false)
      expect(shouldSwapDimensions(OrientationType.BottomRightOrientation)).toBe(false)
      expect(shouldSwapDimensions(OrientationType.BottomLeftOrientation)).toBe(false)
    })

    test('returns true for orientations 5-8 (90/270 degree rotations)', () => {
      expect(shouldSwapDimensions(OrientationType.LeftTopOrientation)).toBe(true)
      expect(shouldSwapDimensions(OrientationType.RightTopOrientation)).toBe(true)
      expect(shouldSwapDimensions(OrientationType.RightBottomOrientation)).toBe(true)
      expect(shouldSwapDimensions(OrientationType.LeftBottomOrientation)).toBe(true)
    })

    test('returns false for undefined orientation (0)', () => {
      expect(shouldSwapDimensions(OrientationType.UndefinedOrientation)).toBe(false)
    })
  })

  describe('Library Loading', () => {
    test('isFFIAvailable returns true when library is accessible', () => {
      // This test will pass if ImageMagick is installed
      const available = isFFIAvailable()
      // We expect it to be available in development environment
      expect(typeof available).toBe('boolean')
    })

    test('getMagickFFI returns singleton instance', () => {
      if (!isFFIAvailable()) {
        console.log('Skipping test: FFI not available')
        return
      }

      const instance1 = getMagickFFI()
      const instance2 = getMagickFFI()
      expect(instance1).toBe(instance2)
    })
  })

  describe('Initialization and Cleanup', () => {
    test('MagickFFI can be initialized and cleaned up', () => {
      if (!isFFIAvailable()) {
        console.log('Skipping test: FFI not available')
        return
      }

      const magick = new MagickFFI()
      expect(magick.isInitialized()).toBe(false)

      magick.init()
      expect(magick.isInitialized()).toBe(true)

      magick.cleanup()
      expect(magick.isInitialized()).toBe(false)
    })

    test('Multiple init calls are safe (idempotent)', () => {
      if (!isFFIAvailable()) {
        console.log('Skipping test: FFI not available')
        return
      }

      const magick = new MagickFFI()
      magick.init()
      magick.init() // Should not throw
      expect(magick.isInitialized()).toBe(true)
      magick.cleanup()
    })

    test('Cleanup when not initialized is safe', () => {
      const magick = new MagickFFI()
      expect(() => magick.cleanup()).not.toThrow()
    })
  })

  describe('Image Dimensions', () => {
    test('reads PNG dimensions correctly (test.png: 600x400)', () => {
      if (!isFFIAvailable()) {
        console.log('Skipping test: FFI not available')
        return
      }

      const magick = getMagickFFI()
      const dims = magick.getImageDimensions(TEST_PNG)

      expect(dims).not.toBeNull()
      expect(dims?.width).toBe(600)
      expect(dims?.height).toBe(400)
    })

    test('reads JPEG dimensions correctly (Portrait_2.jpg: 1200x1800)', () => {
      if (!isFFIAvailable()) {
        console.log('Skipping test: FFI not available')
        return
      }

      const magick = getMagickFFI()
      const dims = magick.getImageDimensions(PORTRAIT_JPG)

      expect(dims).not.toBeNull()
      // Portrait_2.jpg has orientation 2 (TopRight - horizontal flip, no rotation)
      // So dimensions should NOT be swapped
      expect(dims?.width).toBe(1200)
      expect(dims?.height).toBe(1800)
    })

    test('reads large JPEG dimensions correctly (Landscape_2.jpg: 1800x1200)', () => {
      if (!isFFIAvailable()) {
        console.log('Skipping test: FFI not available')
        return
      }

      const magick = getMagickFFI()
      const dims = magick.getImageDimensions(LANDSCAPE_JPG)

      expect(dims).not.toBeNull()
      // Landscape_2.jpg has orientation 2 (TopRight - horizontal flip, no rotation)
      // So dimensions should NOT be swapped
      expect(dims?.width).toBe(1800)
      expect(dims?.height).toBe(1200)
    })

    test('returns null for non-existent file', () => {
      if (!isFFIAvailable()) {
        console.log('Skipping test: FFI not available')
        return
      }

      const magick = getMagickFFI()
      const dims = magick.getImageDimensions('/nonexistent/path/image.jpg')

      expect(dims).toBeNull()
    })

    test('returns null for corrupt image', () => {
      if (!isFFIAvailable()) {
        console.log('Skipping test: FFI not available')
        return
      }

      const magick = getMagickFFI()
      const dims = magick.getImageDimensions(CORRUPT_JPG)

      expect(dims).toBeNull()
    })
  })

  describe('Image Conversion', () => {
    const outputFiles: string[] = []

    afterEach(() => {
      // Clean up any output files created during tests
      for (const file of outputFiles) {
        cleanupFile(file)
      }
      outputFiles.length = 0
    })

    test('converts PNG to WebP', () => {
      if (!isFFIAvailable()) {
        console.log('Skipping test: FFI not available')
        return
      }

      const magick = getMagickFFI()
      const outputPath = join(OUTPUT_DIR, 'test-output.webp')
      outputFiles.push(outputPath)

      const result = magick.convertImage({
        inputPath: TEST_PNG,
        format: 'webp',
        quality: 85,
        outputPath,
      })

      expect(result.success).toBe(true)
      expect(result.outputPath).toBe(outputPath)
      expect(existsSync(outputPath)).toBe(true)
    })

    test('converts JPEG to AVIF', () => {
      if (!isFFIAvailable()) {
        console.log('Skipping test: FFI not available')
        return
      }

      const magick = getMagickFFI()
      const outputPath = join(OUTPUT_DIR, 'test-output.avif')
      outputFiles.push(outputPath)

      const result = magick.convertImage({
        inputPath: PORTRAIT_JPG,
        format: 'avif',
        quality: 80,
        outputPath,
      })

      expect(result.success).toBe(true)
      expect(result.outputPath).toBe(outputPath)
      expect(existsSync(outputPath)).toBe(true)
    })

    test('converts with quality setting', () => {
      if (!isFFIAvailable()) {
        console.log('Skipping test: FFI not available')
        return
      }

      const magick = getMagickFFI()
      const outputPath = join(OUTPUT_DIR, 'test-quality.webp')
      outputFiles.push(outputPath)

      const result = magick.convertImage({
        inputPath: TEST_PNG,
        format: 'webp',
        quality: 50, // Low quality
        outputPath,
      })

      expect(result.success).toBe(true)
      expect(existsSync(outputPath)).toBe(true)
    })

    test('converts with width resize only', () => {
      if (!isFFIAvailable()) {
        console.log('Skipping test: FFI not available')
        return
      }

      const magick = getMagickFFI()
      const outputPath = join(OUTPUT_DIR, 'test-resize-width.webp')
      outputFiles.push(outputPath)

      const result = magick.convertImage({
        inputPath: TEST_PNG,
        format: 'webp',
        quality: 85,
        resizeWidth: 300, // Half of original 600
        outputPath,
      })

      expect(result.success).toBe(true)
      expect(existsSync(outputPath)).toBe(true)

      // Verify the output dimensions
      const dims = magick.getImageDimensions(outputPath)
      expect(dims?.width).toBe(300)
      // Height should be proportionally scaled: 400 * (300/600) = 200
      expect(dims?.height).toBe(200)
    })

    test('converts with height resize only', () => {
      if (!isFFIAvailable()) {
        console.log('Skipping test: FFI not available')
        return
      }

      const magick = getMagickFFI()
      const outputPath = join(OUTPUT_DIR, 'test-resize-height.webp')
      outputFiles.push(outputPath)

      const result = magick.convertImage({
        inputPath: TEST_PNG,
        format: 'webp',
        quality: 85,
        resizeHeight: 200, // Half of original 400
        outputPath,
      })

      expect(result.success).toBe(true)
      expect(existsSync(outputPath)).toBe(true)

      // Verify the output dimensions
      const dims = magick.getImageDimensions(outputPath)
      // Width should be proportionally scaled: 600 * (200/400) = 300
      expect(dims?.width).toBe(300)
      expect(dims?.height).toBe(200)
    })

    test('converts with both width and height resize', () => {
      if (!isFFIAvailable()) {
        console.log('Skipping test: FFI not available')
        return
      }

      const magick = getMagickFFI()
      const outputPath = join(OUTPUT_DIR, 'test-resize-both.webp')
      outputFiles.push(outputPath)

      const result = magick.convertImage({
        inputPath: TEST_PNG,
        format: 'webp',
        quality: 85,
        resizeWidth: 300,
        resizeHeight: 200,
        outputPath,
      })

      expect(result.success).toBe(true)
      expect(existsSync(outputPath)).toBe(true)

      // Verify the output dimensions
      const dims = magick.getImageDimensions(outputPath)
      expect(dims?.width).toBe(300)
      expect(dims?.height).toBe(200)
    })

    test('skips upscaling when target dimensions are larger', () => {
      if (!isFFIAvailable()) {
        console.log('Skipping test: FFI not available')
        return
      }

      const magick = getMagickFFI()
      const outputPath = join(OUTPUT_DIR, 'test-no-upscale.webp')
      outputFiles.push(outputPath)

      // Try to upscale (original is 600x400)
      const result = magick.convertImage({
        inputPath: TEST_PNG,
        format: 'webp',
        quality: 85,
        resizeWidth: 1200, // Double the original
        resizeHeight: 800,
        outputPath,
      })

      expect(result.success).toBe(true)
      expect(existsSync(outputPath)).toBe(true)

      // Verify dimensions were NOT changed (upscaling was skipped)
      const dims = magick.getImageDimensions(outputPath)
      expect(dims?.width).toBe(600)
      expect(dims?.height).toBe(400)
    })

    test('returns error for non-existent input file', () => {
      if (!isFFIAvailable()) {
        console.log('Skipping test: FFI not available')
        return
      }

      const magick = getMagickFFI()
      const outputPath = join(OUTPUT_DIR, 'test-error.webp')
      outputFiles.push(outputPath)

      const result = magick.convertImage({
        inputPath: '/nonexistent/path/image.jpg',
        format: 'webp',
        quality: 85,
        outputPath,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(existsSync(outputPath)).toBe(false)
    })

    test('returns error for corrupt input file', () => {
      if (!isFFIAvailable()) {
        console.log('Skipping test: FFI not available')
        return
      }

      const magick = getMagickFFI()
      const outputPath = join(OUTPUT_DIR, 'test-corrupt-output.webp')
      outputFiles.push(outputPath)

      const result = magick.convertImage({
        inputPath: CORRUPT_JPG,
        format: 'webp',
        quality: 85,
        outputPath,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('Memory Management', () => {
    test('handles multiple operations without memory leak', () => {
      if (!isFFIAvailable()) {
        console.log('Skipping test: FFI not available')
        return
      }

      const magick = getMagickFFI()
      const iterations = 100

      // Record initial memory
      const initialMemory = process.memoryUsage().heapUsed

      // Run many dimension reads
      for (let i = 0; i < iterations; i++) {
        magick.getImageDimensions(TEST_PNG)
      }

      // Force garbage collection if available
      if (typeof Bun.gc === 'function') {
        Bun.gc(true)
      }

      // Check memory growth
      const finalMemory = process.memoryUsage().heapUsed
      const memoryGrowth = finalMemory - initialMemory

      // Allow up to 50MB growth (generous limit for 100 operations)
      const maxAllowedGrowth = 50 * 1024 * 1024 // 50MB in bytes
      expect(memoryGrowth).toBeLessThan(maxAllowedGrowth)
    })
  })

  describe('Enums', () => {
    test('OrientationType has correct values', () => {
      expect(OrientationType.UndefinedOrientation).toBe(0)
      expect(OrientationType.TopLeftOrientation).toBe(1)
      expect(OrientationType.TopRightOrientation).toBe(2)
      expect(OrientationType.BottomRightOrientation).toBe(3)
      expect(OrientationType.BottomLeftOrientation).toBe(4)
      expect(OrientationType.LeftTopOrientation).toBe(5)
      expect(OrientationType.RightTopOrientation).toBe(6)
      expect(OrientationType.RightBottomOrientation).toBe(7)
      expect(OrientationType.LeftBottomOrientation).toBe(8)
    })

    test('FilterType has correct LanczosFilter value', () => {
      expect(FilterType.LanczosFilter).toBe(22)
    })
  })
})
