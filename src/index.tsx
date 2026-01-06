#!/usr/bin/env bun
// ImageMagick TUI - Image compression and conversion tool

// Declare build-time constant (injected during compilation)
declare const MAGICK_TUI_VERSION: string | undefined

import { render, useKeyboard, useRenderer } from '@opentui/solid'
import { TextAttributes } from '@opentui/core'
import { createSignal, createEffect, onMount, Show } from 'solid-js'

import type { ImageFile, OutputFormat, Section, StatusMessage } from './utils/types'
import { scanDirectory, checkImageMagick, checkDiskSpace } from './utils/fileScanner'
import { processImage, validateResize } from './utils/imageProcessor'
import { COLORS, DEFAULT_QUALITY, OUTPUT_FORMATS, QUALITY_PRESETS } from './constants'

import { FileList } from './components/FileList'
import { FormatSelector } from './components/FormatSelector'
import { QualitySelector } from './components/QualitySelector'
import { ResizeInput } from './components/ResizeInput'
import { StatusDisplay } from './components/StatusDisplay'

// Import version from package.json (fallback for dev mode)
import pkg from '../package.json'

// Use build-time constant if available (in compiled binaries), otherwise use package.json
const VERSION = typeof MAGICK_TUI_VERSION !== 'undefined' ? MAGICK_TUI_VERSION : pkg.version

// Handle CLI arguments before launching TUI
const args = process.argv.slice(2)

if (args.includes('--version') || args.includes('-v')) {
  console.log(`magick-tui v${VERSION}`)
  process.exit(0)
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
magick-tui v${VERSION}
A powerful, interactive Terminal User Interface for image compression and conversion using ImageMagick.

Usage:
  magick-tui [options]

Options:
  -v, --version    Show version number
  -h, --help       Show this help message

The interface is intuitive and keyboard-driven:
  - Navigate with Tab or arrow keys
  - Select formats and quality presets
  - Convert images to WebP and AVIF formats
  - Optionally resize images during conversion

For more information, visit: https://github.com/jensderond/magick-tui
`)
  process.exit(0)
}

function App() {
  // Get renderer for proper cleanup
  const renderer = useRenderer()

  // Exit handler that properly cleans up terminal state
  const exitApp = () => {
    renderer.destroy()
  }

  // Image files state
  const [files, setFiles] = createSignal<ImageFile[]>([])
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [loading, setLoading] = createSignal(true)
  const [scanError, setScanError] = createSignal<string | null>(null)

  // Conversion options state
  const [selectedFormats, setSelectedFormats] = createSignal<Set<OutputFormat>>(
    new Set(['webp'])
  )
  const [quality, setQuality] = createSignal(DEFAULT_QUALITY)
  const [resizeWidth, setResizeWidth] = createSignal('')
  const [resizeHeight, setResizeHeight] = createSignal('')

  // UI state
  const [focusedSection, setFocusedSection] = createSignal<Section>('files')
  const [formatFocusIndex, setFormatFocusIndex] = createSignal(0)
  const [qualityFocusIndex, setQualityFocusIndex] = createSignal(1) // Default to Medium
  const [resizeFocusField, setResizeFocusField] = createSignal<'width' | 'height'>('width')
  const [status, setStatus] = createSignal<StatusMessage>({
    type: 'idle',
    message: 'Ready',
  })
  const [processing, setProcessing] = createSignal(false)

  // Current selected image
  const selectedImage = () => files()[selectedIndex()] || null

  // Section navigation order
  const sections: Section[] = ['files', 'formats', 'quality', 'resize', 'convert']

  // Navigate to next/previous section
  const navigateSection = (direction: 'next' | 'prev') => {
    const currentIndex = sections.indexOf(focusedSection())
    const newIndex =
      direction === 'next'
        ? (currentIndex + 1) % sections.length
        : (currentIndex - 1 + sections.length) % sections.length
    const nextSection = sections[newIndex]
    if (nextSection) {
      setFocusedSection(nextSection)
    }
  }

  // Toggle format selection
  const toggleFormat = (format: OutputFormat) => {
    const current = selectedFormats()
    const newSet = new Set(current)

    if (newSet.has(format)) {
      // Don't allow deselecting if it's the only one
      if (newSet.size > 1) {
        newSet.delete(format)
      }
    } else {
      newSet.add(format)
    }

    setSelectedFormats(newSet)
  }

  // Handle conversion
  const handleConvert = async () => {
    const image = selectedImage()
    if (!image || processing()) return

    // Validate at least one format is selected
    if (selectedFormats().size === 0) {
      setStatus({ type: 'error', message: 'Please select at least one output format' })
      return
    }

    // Parse resize values
    const width = resizeWidth() ? parseInt(resizeWidth(), 10) : null
    const height = resizeHeight() ? parseInt(resizeHeight(), 10) : null

    // Validate resize (no upscaling)
    if (width !== null || height !== null) {
      const validation = await validateResize(image.path, width, height)
      if (!validation.valid) {
        setStatus({ type: 'error', message: validation.error || 'Invalid resize' })
        return
      }
    }

    setProcessing(true)
    setStatus({ type: 'processing', message: `Converting ${image.name}...` })

    try {
      const result = await processImage(
        {
          inputPath: image.path,
          outputFormats: Array.from(selectedFormats()),
          quality: quality(),
          resizeWidth: width,
          resizeHeight: height,
        },
        (msg) => setStatus({ type: 'processing', message: msg })
      )

      if (result.success) {
        const outputNames = result.outputPaths?.map((p) => p.split('/').pop()).join(', ')
        setStatus({
          type: 'success',
          message: `Created: ${outputNames}`,
        })

        // Refresh file list to show new files
        const newFiles = await scanDirectory(process.cwd())
        setFiles(newFiles)
      } else {
        setStatus({
          type: 'error',
          message: result.error || 'Conversion failed',
        })
      }
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setProcessing(false)
    }
  }

  // Keyboard handler
  useKeyboard(
    (key) => {
      // Global keys
      if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        exitApp()
      }

      // Don't handle keys while processing
      if (processing()) return

      // Tab navigation
      if (key.name === 'tab') {
        navigateSection(key.shift ? 'prev' : 'next')
        return
      }

      // Section-specific keys
      const section = focusedSection()

      if (section === 'files') {
        if (key.name === 'up' || key.name === 'k') {
          setSelectedIndex((prev) => Math.max(0, prev - 1))
        } else if (key.name === 'down' || key.name === 'j') {
          setSelectedIndex((prev) => Math.min(files().length - 1, prev + 1))
        }
      }

      if (section === 'formats') {
        if (key.name === 'left' || key.name === 'h') {
          setFormatFocusIndex((prev) => Math.max(0, prev - 1))
        } else if (key.name === 'right' || key.name === 'l') {
          setFormatFocusIndex((prev) => Math.min(OUTPUT_FORMATS.length - 1, prev + 1))
        } else if (key.name === 'space') {
          const format = OUTPUT_FORMATS[formatFocusIndex()]
          if (format) toggleFormat(format.format)
        }
      }

      if (section === 'quality') {
        if (key.name === 'left' || key.name === 'h') {
          setQualityFocusIndex((prev) => Math.max(0, prev - 1))
        } else if (key.name === 'right' || key.name === 'l') {
          setQualityFocusIndex((prev) => Math.min(QUALITY_PRESETS.length - 1, prev + 1))
        } else if (key.name === 'return') {
          const preset = QUALITY_PRESETS[qualityFocusIndex()]
          if (preset) setQuality(preset.value)
        }
      }

      if (section === 'resize') {
        // Tab switches between width and height within resize
        if (key.name === 'left' || key.name === 'right') {
          setResizeFocusField((prev) => (prev === 'width' ? 'height' : 'width'))
        }
      }

      if (section === 'convert') {
        if (key.name === 'return') {
          handleConvert()
        }
      }
    },
    {}
  )

  // Initialize app
  onMount(async () => {
    // Check for ImageMagick
    const hasMagick = await checkImageMagick()
    if (!hasMagick) {
      setScanError('ImageMagick not found. Install via: brew install imagemagick')
      setLoading(false)
      return
    }

    // Check disk space
    const hasSpace = await checkDiskSpace(process.cwd())
    if (!hasSpace) {
      setScanError('Cannot write to current directory. Check permissions.')
      setLoading(false)
      return
    }

    // Scan for images
    try {
      const imageFiles = await scanDirectory(process.cwd())
      setFiles(imageFiles)

      if (imageFiles.length === 0) {
        setStatus({
          type: 'warning',
          message: 'No images found in current directory',
        })
      } else {
        setStatus({
          type: 'idle',
          message: `Found ${imageFiles.length} image${imageFiles.length !== 1 ? 's' : ''}`,
        })
      }
    } catch (error) {
      setScanError(
        error instanceof Error ? error.message : 'Failed to scan directory'
      )
    } finally {
      setLoading(false)
    }
  })

  // Update quality focus index when quality changes
  createEffect(() => {
    const q = quality()
    const idx = QUALITY_PRESETS.findIndex((p) => p.value === q)
    if (idx >= 0) setQualityFocusIndex(idx)
  })

  return (
    <box flexDirection="column" flexGrow={1} padding={1}>
      {/* Header */}
      <box justifyContent="center" style={{ marginBottom: 1 }}>
        <ascii_font font="tiny" text="MagickTUI" color={COLORS.primary} />
      </box>

      {/* Main content */}
      <box flexDirection="column" gap={1} flexGrow={1}>
        {/* File list */}
        <FileList
          files={files()}
          selectedIndex={selectedIndex()}
          onSelect={setSelectedIndex}
          focused={focusedSection() === 'files'}
          loading={loading()}
          error={scanError()}
        />

        {/* Options row */}
        <box flexDirection="row" gap={1}>
          {/* Format selector */}
          <box flexGrow={1}>
            <FormatSelector
              selectedFormats={selectedFormats()}
              onToggle={toggleFormat}
              focused={focusedSection() === 'formats'}
              focusedIndex={formatFocusIndex()}
              onFocusedIndexChange={setFormatFocusIndex}
            />
          </box>

          {/* Quality selector */}
          <box flexGrow={2}>
            <QualitySelector
              selectedQuality={quality()}
              onSelect={setQuality}
              focused={focusedSection() === 'quality'}
              focusedIndex={qualityFocusIndex()}
              onFocusedIndexChange={setQualityFocusIndex}
            />
          </box>
        </box>

        {/* Resize input */}
        <ResizeInput
          width={resizeWidth()}
          height={resizeHeight()}
          onWidthChange={setResizeWidth}
          onHeightChange={setResizeHeight}
          originalWidth={selectedImage()?.width || 0}
          originalHeight={selectedImage()?.height || 0}
          focused={focusedSection() === 'resize'}
          focusedField={resizeFocusField()}
          onFocusedFieldChange={setResizeFocusField}
        />

        {/* Convert button */}
        <box
          border
          borderStyle="rounded"
          borderColor={focusedSection() === 'convert' ? COLORS.focused : COLORS.border}
          padding={1}
          justifyContent="center"
          style={{
            backgroundColor:
              focusedSection() === 'convert' && !processing()
                ? COLORS.primary
                : 'transparent',
          }}
        >
          <Show
            when={!processing()}
            fallback={
              <text fg={COLORS.warning} attributes={TextAttributes.BOLD}>
                Processing...
              </text>
            }
          >
            <text
              fg={focusedSection() === 'convert' ? COLORS.text : COLORS.muted}
              attributes={focusedSection() === 'convert' ? TextAttributes.BOLD : 0}
            >
              {focusedSection() === 'convert'
                ? '[ Press Enter to Convert ]'
                : '[ Convert Image ]'}
            </text>
          </Show>
        </box>

        {/* Status display */}
        <box style={{ marginTop: 1 }}>
          <StatusDisplay status={status()} />
        </box>
      </box>

      {/* Footer */}
      <box justifyContent="center" style={{ marginTop: 1 }}>
        <text fg={COLORS.muted}>
          Tab: Navigate | Esc: Exit
        </text>
      </box>
    </box>
  )
}

render(() => <App />, {
  exitOnCtrlC: true,
  onDestroy: () => {
    process.exit(0)
  },
})
