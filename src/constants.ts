// Constants for the ImageMagick TUI application

import type { QualityPreset, OutputFormat } from './utils/types'

export const QUALITY_PRESETS: QualityPreset[] = [
  { name: 'Low', value: 60, description: 'Smaller file size, lower quality' },
  { name: 'Medium', value: 80, description: 'Balanced quality and size' },
  { name: 'High', value: 90, description: 'High quality, larger file' },
  { name: 'Lossless', value: 100, description: 'Maximum quality, largest file' },
]

export const DEFAULT_QUALITY = 80

export const SUPPORTED_INPUT_FORMATS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.avif',
  '.jxl',
  '.heic',
  '.heif',
  '.tiff',
  '.tif',
  '.bmp',
  '.gif',
]

export const OUTPUT_FORMATS: { format: OutputFormat; label: string }[] = [
  { format: 'webp', label: 'WebP' },
  { format: 'avif', label: 'AVIF' },
  { format: 'jxl', label: 'JPEG XL' },
]

// UI Colors
export const COLORS = {
  primary: '#3B82F6', // Blue
  success: '#22C55E', // Green
  successLight: '#4ADE80', // Light green (for moderate compression)
  error: '#EF4444', // Red
  warning: '#F59E0B', // Yellow/Amber
  muted: '#6B7280', // Gray
  text: '#F3F4F6', // Light gray
  background: '#1F2937', // Dark gray
  border: '#374151', // Medium gray
  focused: '#60A5FA', // Light blue for focused elements
  selected: '#2563EB', // Darker blue for selected items
}

// Size estimation debounce delay in milliseconds
export const SIZE_ESTIMATE_DEBOUNCE_MS = 300

// Format file size for display
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Format dimensions for display
export function formatDimensions(width: number, height: number): string {
  return `${width}x${height}`
}
