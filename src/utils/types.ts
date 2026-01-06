// TypeScript interfaces and types for the ImageMagick TUI application

export interface ImageFile {
  name: string
  path: string
  size: number // in bytes
  width: number
  height: number
  format: string // file extension
}

export type OutputFormat = 'webp' | 'avif'

export interface QualityPreset {
  name: string
  value: number
  description: string
}

export type StatusType = 'idle' | 'processing' | 'success' | 'error' | 'warning'

export interface StatusMessage {
  type: StatusType
  message: string
}

export interface ProcessOptions {
  inputPath: string
  outputFormats: OutputFormat[]
  quality: number
  resizeWidth: number | null
  resizeHeight: number | null
}

export interface ProcessResult {
  success: boolean
  outputPaths?: string[]
  error?: string
}

export interface ImageDimensions {
  width: number
  height: number
}

export type Section = 'files' | 'formats' | 'quality' | 'resize' | 'convert'

// Re-export FFI types for convenience
export type {
  ConvertOptions,
  ConvertResult,
  MagickFFIConfig,
} from './magickFFI'
