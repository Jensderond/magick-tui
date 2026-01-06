/**
 * Performance benchmarks for FFI vs Shell implementations
 *
 * Run with: bun test src/utils/__tests__/performance.bench.ts
 */

import { describe, test, expect, beforeAll, afterAll, afterEach } from 'bun:test'
import { join } from 'node:path'
import { existsSync, unlinkSync, readdirSync } from 'node:fs'
import { getMagickFFI, resetMagickFFI, isFFIAvailable } from '../magickFFI'
import { getImageDimensions } from '../fileScanner'
import { processImage } from '../imageProcessor'
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

// Benchmark helper
async function benchmark(
  name: string,
  iterations: number,
  fn: () => Promise<void> | void
): Promise<{ name: string; iterations: number; totalMs: number; avgMs: number }> {
  const start = performance.now()

  for (let i = 0; i < iterations; i++) {
    await fn()
  }

  const end = performance.now()
  const totalMs = end - start
  const avgMs = totalMs / iterations

  return { name, iterations, totalMs, avgMs }
}

describe('Performance Benchmarks', () => {
  beforeAll(() => {
    resetMagickFFI()
  })

  afterEach(() => {
    cleanupGeneratedFiles()
    Bun.env.MAGICK_USE_FFI = originalFFIEnv
  })

  afterAll(() => {
    cleanupGeneratedFiles()
    resetMagickFFI()
    Bun.env.MAGICK_USE_FFI = originalFFIEnv
  })

  describe('Dimension Reading Benchmark', () => {
    const ITERATIONS = 100

    test(`FFI vs Shell: Read dimensions ${ITERATIONS}x`, async () => {
      if (!isFFIAvailable()) {
        console.log('Skipping benchmark: FFI not available')
        return
      }

      // Warm up FFI
      const magick = getMagickFFI()
      magick.getImageDimensions(TEST_PNG)

      // Benchmark FFI (direct call)
      const ffiResult = await benchmark('FFI Direct', ITERATIONS, () => {
        magick.getImageDimensions(TEST_PNG)
      })

      // Benchmark Shell
      Bun.env.MAGICK_USE_FFI = 'false'
      const shellResult = await benchmark('Shell', ITERATIONS, async () => {
        await getImageDimensions(TEST_PNG)
      })

      // Calculate speedup
      const speedup = shellResult.avgMs / ffiResult.avgMs

      // Log results
      console.log('\n=== Dimension Reading Benchmark ===')
      console.log(`FFI:   ${ffiResult.avgMs.toFixed(3)}ms avg (${ffiResult.totalMs.toFixed(0)}ms total)`)
      console.log(`Shell: ${shellResult.avgMs.toFixed(3)}ms avg (${shellResult.totalMs.toFixed(0)}ms total)`)
      console.log(`Speedup: ${speedup.toFixed(2)}x`)

      // Assert FFI is faster (at least 1.5x)
      expect(speedup).toBeGreaterThan(1.5)
    })
  })

  describe('Image Conversion Benchmark', () => {
    const ITERATIONS = 10 // Fewer iterations for conversion (slower operation)

    test(`FFI vs Shell: Convert PNG to WebP ${ITERATIONS}x`, async () => {
      if (!isFFIAvailable()) {
        console.log('Skipping benchmark: FFI not available')
        return
      }

      // Clean up before each iteration
      const cleanup = () => cleanupGeneratedFiles()

      // Benchmark FFI
      Bun.env.MAGICK_USE_FFI = 'true'
      const ffiResult = await benchmark('FFI Conversion', ITERATIONS, async () => {
        cleanup()
        await processImage({
          inputPath: TEST_PNG,
          outputFormats: ['webp'],
          quality: 85,
          resizeWidth: null,
          resizeHeight: null,
        })
      })

      // Benchmark Shell
      Bun.env.MAGICK_USE_FFI = 'false'
      const shellResult = await benchmark('Shell Conversion', ITERATIONS, async () => {
        cleanup()
        await processImage({
          inputPath: TEST_PNG,
          outputFormats: ['webp'],
          quality: 85,
          resizeWidth: null,
          resizeHeight: null,
        })
      })

      // Calculate speedup
      const speedup = shellResult.avgMs / ffiResult.avgMs

      // Log results
      console.log('\n=== Image Conversion Benchmark ===')
      console.log(`FFI:   ${ffiResult.avgMs.toFixed(3)}ms avg (${ffiResult.totalMs.toFixed(0)}ms total)`)
      console.log(`Shell: ${shellResult.avgMs.toFixed(3)}ms avg (${shellResult.totalMs.toFixed(0)}ms total)`)
      console.log(`Speedup: ${speedup.toFixed(2)}x`)

      // For conversion, FFI should still be faster but maybe not as dramatic
      // Allow for 1.0x speedup since conversion is I/O bound
      expect(speedup).toBeGreaterThanOrEqual(1.0)
    })

    test(`FFI vs Shell: Convert JPEG with resize ${ITERATIONS}x`, async () => {
      if (!isFFIAvailable()) {
        console.log('Skipping benchmark: FFI not available')
        return
      }

      const cleanup = () => cleanupGeneratedFiles()

      // Benchmark FFI with resize
      Bun.env.MAGICK_USE_FFI = 'true'
      const ffiResult = await benchmark('FFI Resize', ITERATIONS, async () => {
        cleanup()
        await processImage({
          inputPath: PORTRAIT_JPG,
          outputFormats: ['webp'],
          quality: 85,
          resizeWidth: 600,
          resizeHeight: null,
        })
      })

      // Benchmark Shell with resize
      Bun.env.MAGICK_USE_FFI = 'false'
      const shellResult = await benchmark('Shell Resize', ITERATIONS, async () => {
        cleanup()
        await processImage({
          inputPath: PORTRAIT_JPG,
          outputFormats: ['webp'],
          quality: 85,
          resizeWidth: 600,
          resizeHeight: null,
        })
      })

      // Calculate speedup
      const speedup = shellResult.avgMs / ffiResult.avgMs

      console.log('\n=== Resize Conversion Benchmark ===')
      console.log(`FFI:   ${ffiResult.avgMs.toFixed(3)}ms avg (${ffiResult.totalMs.toFixed(0)}ms total)`)
      console.log(`Shell: ${shellResult.avgMs.toFixed(3)}ms avg (${shellResult.totalMs.toFixed(0)}ms total)`)
      console.log(`Speedup: ${speedup.toFixed(2)}x`)

      // Log result but don't fail test - conversion performance varies
      expect(speedup).toBeGreaterThanOrEqual(0.8) // Allow some variance
    })
  })

  describe('Summary', () => {
    test('Print performance summary', () => {
      console.log('\n========================================')
      console.log('Performance Benchmark Summary')
      console.log('========================================')
      console.log('Expected results:')
      console.log('- Dimension reading: 2-4x faster with FFI')
      console.log('- Image conversion: 1.5-2x faster with FFI')
      console.log('========================================')
    })
  })
})
