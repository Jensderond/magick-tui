/**
 * Integration tests for imageProcessor module
 */

import { describe, test, expect, beforeAll, afterEach, afterAll } from 'bun:test'
import { join } from 'node:path'
import { existsSync, unlinkSync, readdirSync } from 'node:fs'
import { processImage, validateResize, describeProcessing } from '../imageProcessor'
import { resetMagickFFI } from '../magickFFI'
import type { ProcessOptions } from '../types'

// Test fixtures directory
const FIXTURES_DIR = join(import.meta.dir, '../__fixtures__')
const TEST_PNG = join(FIXTURES_DIR, 'test.png')
const PORTRAIT_JPG = join(FIXTURES_DIR, 'Portrait_2.jpg')

// Store original env value
const originalFFIEnv = Bun.env.MAGICK_USE_FFI

// Helper to clean up generated files
function cleanupGeneratedFiles(): void {
  try {
    const files = readdirSync(FIXTURES_DIR)
    for (const file of files) {
      // Clean up any webp or avif files (generated outputs)
      if (file.endsWith('.webp') || file.endsWith('.avif')) {
        const path = join(FIXTURES_DIR, file)
        if (existsSync(path)) {
          try {
            unlinkSync(path)
          } catch {
            // Ignore
          }
        }
      }
    }
  } catch {
    // Ignore errors
  }
}

describe('imageProcessor', () => {
  beforeAll(() => {
    resetMagickFFI()
  })

  afterEach(() => {
    cleanupGeneratedFiles()
    // Restore original env
    Bun.env.MAGICK_USE_FFI = originalFFIEnv
  })

  afterAll(() => {
    cleanupGeneratedFiles()
    resetMagickFFI()
    Bun.env.MAGICK_USE_FFI = originalFFIEnv
  })

  describe('validateResize', () => {
    test('returns valid for no resize', async () => {
      const result = await validateResize(TEST_PNG, null, null)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    test('returns valid for downscale width', async () => {
      // test.png is 600x400
      const result = await validateResize(TEST_PNG, 300, null)
      expect(result.valid).toBe(true)
    })

    test('returns valid for downscale height', async () => {
      const result = await validateResize(TEST_PNG, null, 200)
      expect(result.valid).toBe(true)
    })

    test('returns invalid for upscale width', async () => {
      // test.png is 600x400
      const result = await validateResize(TEST_PNG, 800, null)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('upscale')
    })

    test('returns invalid for upscale height', async () => {
      const result = await validateResize(TEST_PNG, null, 600)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('upscale')
    })

    test('returns invalid for non-existent file', async () => {
      const result = await validateResize('/nonexistent/file.jpg', 100, 100)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('dimensions')
    })
  })

  describe('processImage with FFI', () => {
    test('converts PNG to WebP with FFI enabled', async () => {
      Bun.env.MAGICK_USE_FFI = 'true'

      const options: ProcessOptions = {
        inputPath: TEST_PNG,
        outputFormats: ['webp'],
        quality: 85,
        resizeWidth: null,
        resizeHeight: null,
      }

      const result = await processImage(options)

      expect(result.success).toBe(true)
      expect(result.outputPaths).toBeDefined()
      expect(result.outputPaths?.length).toBe(1)
      expect(result.outputPaths?.[0]).toContain('.webp')
      if (result.outputPaths?.[0]) {
        expect(existsSync(result.outputPaths[0])).toBe(true)
      }
    })

    test('converts PNG to AVIF with FFI enabled', async () => {
      Bun.env.MAGICK_USE_FFI = 'true'

      const options: ProcessOptions = {
        inputPath: TEST_PNG,
        outputFormats: ['avif'],
        quality: 80,
        resizeWidth: null,
        resizeHeight: null,
      }

      const result = await processImage(options)

      expect(result.success).toBe(true)
      expect(result.outputPaths).toBeDefined()
      expect(result.outputPaths?.length).toBe(1)
      expect(result.outputPaths?.[0]).toContain('.avif')
    })

    test('converts to multiple formats', async () => {
      Bun.env.MAGICK_USE_FFI = 'true'

      const options: ProcessOptions = {
        inputPath: TEST_PNG,
        outputFormats: ['webp', 'avif'],
        quality: 85,
        resizeWidth: null,
        resizeHeight: null,
      }

      const result = await processImage(options)

      expect(result.success).toBe(true)
      expect(result.outputPaths?.length).toBe(2)
    })

    test('converts with resize', async () => {
      Bun.env.MAGICK_USE_FFI = 'true'

      const options: ProcessOptions = {
        inputPath: TEST_PNG,
        outputFormats: ['webp'],
        quality: 85,
        resizeWidth: 300,
        resizeHeight: null,
      }

      const result = await processImage(options)

      expect(result.success).toBe(true)
      expect(result.outputPaths?.length).toBe(1)
    })

    test('reports progress during conversion', async () => {
      Bun.env.MAGICK_USE_FFI = 'true'

      const progressMessages: string[] = []

      const options: ProcessOptions = {
        inputPath: TEST_PNG,
        outputFormats: ['webp', 'avif'],
        quality: 85,
        resizeWidth: null,
        resizeHeight: null,
      }

      await processImage(options, (message) => {
        progressMessages.push(message)
      })

      expect(progressMessages.length).toBe(2)
      expect(progressMessages[0]).toContain('WEBP')
      expect(progressMessages[1]).toContain('AVIF')
    })
  })

  describe('processImage with Shell fallback', () => {
    test('converts PNG to WebP with shell fallback', async () => {
      Bun.env.MAGICK_USE_FFI = 'false'

      const options: ProcessOptions = {
        inputPath: TEST_PNG,
        outputFormats: ['webp'],
        quality: 85,
        resizeWidth: null,
        resizeHeight: null,
      }

      const result = await processImage(options)

      expect(result.success).toBe(true)
      expect(result.outputPaths).toBeDefined()
      expect(result.outputPaths?.length).toBe(1)
    })

    test('converts to multiple formats with shell', async () => {
      Bun.env.MAGICK_USE_FFI = 'false'

      const options: ProcessOptions = {
        inputPath: TEST_PNG,
        outputFormats: ['webp', 'avif'],
        quality: 85,
        resizeWidth: null,
        resizeHeight: null,
      }

      const result = await processImage(options)

      expect(result.success).toBe(true)
      expect(result.outputPaths?.length).toBe(2)
    })
  })

  describe('Error handling', () => {
    test('returns error for non-existent file', async () => {
      const options: ProcessOptions = {
        inputPath: '/nonexistent/file.png',
        outputFormats: ['webp'],
        quality: 85,
        resizeWidth: null,
        resizeHeight: null,
      }

      const result = await processImage(options)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    test('returns error for upscale attempt', async () => {
      const options: ProcessOptions = {
        inputPath: TEST_PNG,
        outputFormats: ['webp'],
        quality: 85,
        resizeWidth: 1200, // test.png is 600x400
        resizeHeight: null,
      }

      const result = await processImage(options)

      expect(result.success).toBe(false)
      expect(result.error).toContain('upscale')
    })
  })

  describe('describeProcessing', () => {
    test('describes basic options', () => {
      const options: ProcessOptions = {
        inputPath: '/test/image.png',
        outputFormats: ['webp'],
        quality: 85,
        resizeWidth: null,
        resizeHeight: null,
      }

      const description = describeProcessing(options)

      expect(description).toContain('Quality: 85%')
      expect(description).toContain('WEBP')
    })

    test('describes options with resize', () => {
      const options: ProcessOptions = {
        inputPath: '/test/image.png',
        outputFormats: ['webp', 'avif'],
        quality: 75,
        resizeWidth: 800,
        resizeHeight: 600,
      }

      const description = describeProcessing(options)

      expect(description).toContain('Quality: 75%')
      expect(description).toContain('800px')
      expect(description).toContain('600px')
      expect(description).toContain('WEBP')
      expect(description).toContain('AVIF')
    })

    test('describes options with width only', () => {
      const options: ProcessOptions = {
        inputPath: '/test/image.png',
        outputFormats: ['webp'],
        quality: 85,
        resizeWidth: 800,
        resizeHeight: null,
      }

      const description = describeProcessing(options)

      expect(description).toContain('800px')
      expect(description).toContain('auto')
    })

    test('describes options with height only', () => {
      const options: ProcessOptions = {
        inputPath: '/test/image.png',
        outputFormats: ['webp'],
        quality: 85,
        resizeWidth: null,
        resizeHeight: 600,
      }

      const description = describeProcessing(options)

      expect(description).toContain('auto')
      expect(description).toContain('600px')
    })
  })
})
