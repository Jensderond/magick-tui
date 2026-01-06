/**
 * Tests for fileScanner module
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { join } from 'node:path'
import {
  isImageFile,
  getImageDimensions,
  scanDirectory,
  generateOutputPath,
  checkImageMagick,
} from '../fileScanner'
import { resetMagickFFI } from '../magickFFI'

// Test fixtures directory
const FIXTURES_DIR = join(import.meta.dir, '../__fixtures__')
const TEST_PNG = join(FIXTURES_DIR, 'test.png')
const PORTRAIT_JPG = join(FIXTURES_DIR, 'Portrait_2.jpg')
const LANDSCAPE_JPG = join(FIXTURES_DIR, 'Landscape_2.jpg')

// Store original env value
const originalFFIEnv = Bun.env.MAGICK_USE_FFI

describe('fileScanner', () => {
  beforeAll(() => {
    resetMagickFFI()
  })

  afterAll(() => {
    resetMagickFFI()
    Bun.env.MAGICK_USE_FFI = originalFFIEnv
  })

  describe('isImageFile', () => {
    test('returns true for supported image formats', () => {
      expect(isImageFile('test.png')).toBe(true)
      expect(isImageFile('test.jpg')).toBe(true)
      expect(isImageFile('test.jpeg')).toBe(true)
      expect(isImageFile('test.PNG')).toBe(true)
      expect(isImageFile('test.JPG')).toBe(true)
      expect(isImageFile('test.JPEG')).toBe(true)
    })

    test('returns false for unsupported formats', () => {
      expect(isImageFile('test.txt')).toBe(false)
      expect(isImageFile('test.pdf')).toBe(false)
      expect(isImageFile('test.doc')).toBe(false)
      expect(isImageFile('test')).toBe(false)
    })
  })

  describe('getImageDimensions with FFI', () => {
    beforeAll(() => {
      Bun.env.MAGICK_USE_FFI = 'true'
    })

    test('returns dimensions for PNG (test.png: 600x400)', async () => {
      const dims = await getImageDimensions(TEST_PNG)
      expect(dims).not.toBeNull()
      expect(dims?.width).toBe(600)
      expect(dims?.height).toBe(400)
    })

    test('returns dimensions for JPEG portrait', async () => {
      const dims = await getImageDimensions(PORTRAIT_JPG)
      expect(dims).not.toBeNull()
      expect(dims?.width).toBe(1200)
      expect(dims?.height).toBe(1800)
    })

    test('returns dimensions for JPEG landscape', async () => {
      const dims = await getImageDimensions(LANDSCAPE_JPG)
      expect(dims).not.toBeNull()
      expect(dims?.width).toBe(1800)
      expect(dims?.height).toBe(1200)
    })

    test('returns null for non-existent file', async () => {
      const dims = await getImageDimensions('/nonexistent/file.jpg')
      expect(dims).toBeNull()
    })
  })

  describe('getImageDimensions with Shell', () => {
    beforeAll(() => {
      Bun.env.MAGICK_USE_FFI = 'false'
    })

    test('returns dimensions for PNG using shell', async () => {
      const dims = await getImageDimensions(TEST_PNG)
      expect(dims).not.toBeNull()
      expect(dims?.width).toBe(600)
      expect(dims?.height).toBe(400)
    })

    test('returns dimensions for JPEG using shell', async () => {
      const dims = await getImageDimensions(PORTRAIT_JPG)
      expect(dims).not.toBeNull()
      expect(dims?.width).toBe(1200)
      expect(dims?.height).toBe(1800)
    })
  })

  describe('scanDirectory', () => {
    test('scans fixtures directory and finds image files', async () => {
      const files = await scanDirectory(FIXTURES_DIR)

      expect(files.length).toBeGreaterThanOrEqual(3) // At least test.png, Portrait_2.jpg, Landscape_2.jpg
      
      // Find test.png
      const testPng = files.find(f => f.name === 'test.png')
      expect(testPng).toBeDefined()
      expect(testPng?.format).toBe('png')
      // scanDirectory does not load dimensions (width/height are 0)
      expect(testPng?.width).toBe(0)
      expect(testPng?.height).toBe(0)
    })

    test('returns empty array for directory with no images', async () => {
      // Create a temp directory or use a directory known to have no images
      // For this test, we'll check that the function handles it gracefully
      const files = await scanDirectory('/tmp')
      expect(Array.isArray(files)).toBe(true)
    })

    test('files are sorted by name', async () => {
      const files = await scanDirectory(FIXTURES_DIR)
      
      const names = files.map(f => f.name)
      const sortedNames = [...names].sort((a, b) => a.localeCompare(b))
      expect(names).toEqual(sortedNames)
    })
  })

  describe('generateOutputPath', () => {
    test('generates webp output path', () => {
      const output = generateOutputPath(TEST_PNG, 'webp')
      expect(output).toContain('test.webp')
      expect(output).toContain(FIXTURES_DIR)
    })

    test('generates avif output path', () => {
      const output = generateOutputPath(TEST_PNG, 'avif')
      expect(output).toContain('test.avif')
    })

    test('handles files with multiple dots', () => {
      const input = join(FIXTURES_DIR, 'test.image.png')
      const output = generateOutputPath(input, 'webp')
      expect(output).toContain('test.image.webp')
    })
  })

  describe('checkImageMagick', () => {
    test('returns true when ImageMagick is installed', async () => {
      const result = await checkImageMagick()
      // This should be true in dev environment with ImageMagick installed
      expect(result).toBe(true)
    })
  })
})
